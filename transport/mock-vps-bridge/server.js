const { spawn } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const { WebSocketServer } = require('ws');

const PORT = Number(process.env.PORT || 8787);
const HERMES_BIN = process.env.HERMES_BIN || 'hermes';
const HERMES_WORKDIR = process.env.HERMES_WORKDIR || '/root';
const HERMES_TIMEOUT_MS = Number(process.env.HERMES_TIMEOUT_MS || 45000);
const HERMES_DEFAULT_ARGS = ['-t', 'search'];
const HERMES_EXTRA_ARGS = String(process.env.HERMES_ARGS || '').trim().split(/\s+/).filter(Boolean);
const ALLOWED_ORIGINS = String(
  process.env.ALLOWED_ORIGINS || 'https://test.hamoun.fun,null,http://127.0.0.1:8080,http://localhost:8080'
)
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);
const MAX_INPUT_CHARS = Number(process.env.MAX_INPUT_CHARS || 2000);
const ENABLE_REMOTE_TTS = process.env.ENABLE_REMOTE_TTS !== 'false';
const HERMES_ENV_PATH = process.env.HERMES_ENV_PATH || '/root/.hermes/.env';
const HERMES_CONFIG_PATH = process.env.HERMES_CONFIG_PATH || '/root/.hermes/config.yaml';
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY || readEnvValue(HERMES_ENV_PATH, 'ELEVENLABS_API_KEY');
const ELEVENLABS_VOICE_ID = process.env.ELEVENLABS_VOICE_ID || readTtsConfigValue('voice_id');
const ELEVENLABS_MODEL_ID = process.env.ELEVENLABS_MODEL_ID || readTtsConfigValue('model_id') || 'eleven_v3';
const AUDIO_CACHE_DIR = process.env.AUDIO_CACHE_DIR || '/var/www/test.hamoun.fun/voice-cache';
const PUBLIC_AUDIO_BASE_URL = process.env.PUBLIC_AUDIO_BASE_URL || 'https://test.hamoun.fun/voice-cache';
const TTS_MAX_CHARS = Number(process.env.TTS_MAX_CHARS || 900);
const TTS_TIMEOUT_MS = Number(process.env.TTS_TIMEOUT_MS || 35000);
const sessions = new Map();
let sessionCounter = 1;

const wss = new WebSocketServer({ port: PORT });

function readEnvValue(envPath, key) {
  try {
    const text = fs.readFileSync(envPath, 'utf8');
    const match = text.match(new RegExp(`^${key}=(.+)$`, 'm'));
    return match ? match[1].trim() : '';
  } catch (_error) {
    return '';
  }
}

function readTtsConfigValue(field) {
  try {
    const text = fs.readFileSync(HERMES_CONFIG_PATH, 'utf8');
    const pattern = new RegExp(`(?:^|\\n)tts:\\n[\\s\\S]*?^\\s{2}elevenlabs:\\n[\\s\\S]*?^\\s{4}${field}:\\s*(.+)$`, 'm');
    const match = text.match(pattern);
    return match ? match[1].trim().replace(/^['"]|['"]$/g, '') : '';
  } catch (_error) {
    return '';
  }
}

function send(ws, payload) {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

function emitState(ws, state, energy, phase = 'remote_live') {
  send(ws, { type: 'state', state, energy, phase });
}

function cleanupSession(session) {
  session.timers.forEach(clearTimeout);
  session.timers = [];
  session.activeRequestId = null;

  if (session.activeChild) {
    const child = session.activeChild;
    try {
      child.kill('SIGTERM');
    } catch (_error) {
      // ignore kill races
    }
    const forceKillTimer = setTimeout(() => {
      try {
        if (!child.killed) child.kill('SIGKILL');
      } catch (_error) {
        // ignore late cleanup
      }
    }, 1500);
    session.timers.push(forceKillTimer);
    session.activeChild = null;
  }

  if (session.activeTimeout) {
    clearTimeout(session.activeTimeout);
    session.activeTimeout = null;
  }
}

function queueTimer(session, fn, delay) {
  const timer = setTimeout(() => {
    session.timers = session.timers.filter((entry) => entry !== timer);
    fn();
  }, delay);

  session.timers.push(timer);
  return timer;
}

function normalizeHermesOutput(stdout, stderr) {
  const combined = [String(stdout || ''), String(stderr || '')]
    .join('\n')
    .replace(/<tool_call>[\s\S]*?<\/tool_call>/gi, ' ')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !line.startsWith('session_id:'))
    .filter((line) => !/^charger\b/i.test(line))
    .filter((line) => !/^\{\s*"name"\s*:\s*"[^"]+"/i.test(line))
    .filter((line) => !/^verified:/i.test(line));

  return combined.join('\n').trim();
}

function isHermesOutputUsable(text) {
  const value = String(text || '').trim();
  if (!value) return false;
  if (/<\/?tool_call>/i.test(value)) return false;
  if (/^\s*[\[{]/.test(value)) return false;
  if (/"name"\s*:\s*"[^"]+"/i.test(value) && /"arguments"\s*:/i.test(value)) return false;
  if (/^charger\b/i.test(value)) return false;
  if (/tool call/i.test(value)) return false;
  return true;
}

function buildFallbackReply(text) {
  return `Reçu, Monsieur. La passerelle Hermes est bien connectée et j’ai reçu : ${text}`;
}

function isLoopbackAddress(address) {
  return ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(address);
}

function isOriginAllowed(origin, remoteAddress) {
  if (!origin) {
    return isLoopbackAddress(remoteAddress);
  }
  return ALLOWED_ORIGINS.includes(origin);
}

function buildHermesPrompt(text) {
  return [
    'Respond as the assistant to the user message below.',
    'Return plain text only.',
    'Do not emit tool calls, XML tags, markdown code fences, or meta commentary.',
    '',
    `User message: ${text}`,
  ].join('\n');
}

function sanitizeTtsText(text) {
  return String(text || '')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/[`*_#<>[\]{}|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, TTS_MAX_CHARS);
}

function runProcess(command, args, { timeoutMs = 30000, cwd = process.cwd(), stdio = ['ignore', 'pipe', 'pipe'] } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, stdio, shell: false });
    let stdout = '';
    let stderr = '';
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try {
        child.kill('SIGKILL');
      } catch (_error) {
        // ignore
      }
      reject(new Error(`${command} timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    child.stdout?.on('data', (chunk) => {
      stdout += chunk;
    });

    child.stderr?.on('data', (chunk) => {
      stderr += chunk;
    });

    child.on('error', (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(error);
    });

    child.on('close', (code, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }
      reject(new Error(stderr.trim() || `${command} failed (${signal ? `signal ${signal}` : `exit code ${code}`})`));
    });
  });
}

async function synthesizeJarvisAudio(text, sessionId) {
  if (!ENABLE_REMOTE_TTS || !ELEVENLABS_API_KEY || !ELEVENLABS_VOICE_ID) {
    return '';
  }

  const ttsText = sanitizeTtsText(text);
  if (!ttsText) {
    return '';
  }

  await fsp.mkdir(AUDIO_CACHE_DIR, { recursive: true });
  await fsp.chmod(AUDIO_CACHE_DIR, 0o755).catch(() => {});

  const fileToken = `${Date.now()}-${sessionId}-${crypto.randomUUID().slice(0, 8)}`;
  const rawPath = path.join(AUDIO_CACHE_DIR, `${fileToken}-raw.mp3`);
  const outPath = path.join(AUDIO_CACHE_DIR, `${fileToken}.ogg`);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TTS_TIMEOUT_MS);

  try {
    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'xi-api-key': ELEVENLABS_API_KEY,
        accept: 'audio/mpeg',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        text: ttsText,
        model_id: ELEVENLABS_MODEL_ID,
        voice_settings: {
          stability: 0.22,
          similarity_boost: 0.56,
          style: 0.08,
          use_speaker_boost: true,
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`ElevenLabs TTS failed (${response.status}): ${errorText.slice(0, 200)}`);
    }

    const audioBuffer = Buffer.from(await response.arrayBuffer());
    await fsp.writeFile(rawPath, audioBuffer);

    await runProcess('ffmpeg', [
      '-y',
      '-i', rawPath,
      '-af',
      'highpass=f=135,lowpass=f=7800,equalizer=f=3200:t=q:w=1.2:g=3,equalizer=f=4800:t=q:w=1.0:g=2.2,aecho=0.75:0.45:18|42:0.10|0.06,acompressor=threshold=-21dB:ratio=3.2:attack=8:release=120:makeup=6,loudnorm=I=-14:TP=-1.5:LRA=7',
      '-c:a',
      'libopus',
      '-b:a',
      '96k',
      outPath,
    ], { timeoutMs: TTS_TIMEOUT_MS });

    await fsp.chmod(outPath, 0o644).catch(() => {});
    return `${PUBLIC_AUDIO_BASE_URL}/${path.basename(outPath)}`;
  } finally {
    clearTimeout(timeout);
    await fsp.unlink(rawPath).catch(() => {});
  }
}

function runHermesQuery(session, text) {
  return new Promise((resolve, reject) => {
    const args = ['chat', '-Q', ...HERMES_DEFAULT_ARGS, '-q', buildHermesPrompt(text), ...HERMES_EXTRA_ARGS];
    const child = spawn(HERMES_BIN, args, {
      cwd: HERMES_WORKDIR,
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: false,
    });

    session.activeChild = child;

    let stdout = '';
    let stderr = '';
    let settled = false;

    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill('SIGKILL');
      reject(new Error(`Hermes CLI timed out after ${HERMES_TIMEOUT_MS}ms`));
    }, HERMES_TIMEOUT_MS);
    session.activeTimeout = timer;

    child.on('error', (error) => {
      if (settled) return;
      settled = true;
      if (session.activeTimeout === timer) {
        clearTimeout(timer);
        session.activeTimeout = null;
      }
      if (session.activeChild === child) {
        session.activeChild = null;
      }
      reject(error);
    });

    child.on('close', (code, signal) => {
      if (settled) return;
      settled = true;
      if (session.activeTimeout === timer) {
        clearTimeout(timer);
        session.activeTimeout = null;
      }
      if (session.activeChild === child) {
        session.activeChild = null;
      }

      const reply = normalizeHermesOutput(stdout, stderr);
      if (code === 0) {
        resolve(reply || 'Hermes n’a renvoyé aucun texte.');
        return;
      }

      const reason = signal ? `signal ${signal}` : `exit code ${code}`;
      reject(new Error(reply ? `Hermes CLI failed (${reason}): ${reply}` : `Hermes CLI failed (${reason}).`));
    });
  });
}

async function handlePrompt(ws, sessionId, text, mode) {
  const session = sessions.get(ws);
  if (!session || session.sessionId !== sessionId) return;

  const cleanedText = String(text || '').trim();
  if (!cleanedText) {
    send(ws, {
      type: 'status',
      text: 'Message vide ignoré par le bridge Hermes',
      phase: 'remote_error',
      session_id: sessionId,
    });
    emitState(ws, 'idle', 0.28, 'remote_live');
    return;
  }

  if (cleanedText.length > MAX_INPUT_CHARS) {
    send(ws, {
      type: 'status',
      text: `Message trop long (${cleanedText.length} caractères, limite ${MAX_INPUT_CHARS})`,
      phase: 'remote_error',
      session_id: sessionId,
    });
    emitState(ws, 'idle', 0.28, 'remote_live');
    return;
  }

  cleanupSession(session);
  session.requestCounter += 1;
  const requestId = session.requestCounter;
  session.activeRequestId = requestId;
  send(ws, { type: 'transcript_user', text: cleanedText });
  emitState(ws, mode === 'transcript' ? 'listening' : 'thinking', mode === 'transcript' ? 0.56 : 0.64, 'remote_live');

  queueTimer(session, () => {
    send(ws, {
      type: 'status',
      text: mode === 'command' ? 'Commande transmise à Hermes CLI' : 'Transcript transmis à Hermes CLI',
      phase: 'remote_live',
      session_id: sessionId,
    });
    emitState(ws, 'thinking', 0.74, 'remote_live');
  }, 80);

  try {
    const reply = await runHermesQuery(session, cleanedText);
    const latestSession = sessions.get(ws);
    if (!latestSession || latestSession.sessionId !== sessionId || latestSession.activeRequestId !== requestId) return;

    const finalReply = isHermesOutputUsable(reply) ? reply : buildFallbackReply(cleanedText);
    send(ws, {
      type: 'status',
      text: ENABLE_REMOTE_TTS ? 'Synthèse JARVIS en cours…' : 'Réponse Hermes prête',
      phase: 'remote_live',
      session_id: sessionId,
    });
    emitState(ws, 'speaking', 0.88, 'remote_live');

    let audioUrl = '';
    try {
      audioUrl = await synthesizeJarvisAudio(finalReply, sessionId);
    } catch (error) {
      send(ws, {
        type: 'status',
        text: `TTS distant indisponible: ${error.message}`,
        phase: 'remote_error',
        session_id: sessionId,
      });
    }

    const stillLatest = sessions.get(ws);
    if (!stillLatest || stillLatest.sessionId !== sessionId || stillLatest.activeRequestId !== requestId) return;

    stillLatest.activeRequestId = null;
    send(ws, { type: 'assistant_response', text: finalReply, audio_url: audioUrl || '' });

    queueTimer(stillLatest, () => {
      emitState(ws, 'idle', 0.3, 'remote_live');
      send(ws, {
        type: 'status',
        text: audioUrl ? 'Réponse Hermes + voix JARVIS renvoyées au client' : 'Réponse Hermes renvoyée au client',
        phase: 'remote_live',
        session_id: sessionId,
      });
    }, 250);
  } catch (error) {
    const latestSession = sessions.get(ws);
    if (!latestSession || latestSession.sessionId !== sessionId || latestSession.activeRequestId !== requestId) return;

    latestSession.activeRequestId = null;
    emitState(ws, 'idle', 0.22, 'remote_error');
    send(ws, {
      type: 'status',
      text: error.message,
      phase: 'remote_error',
      session_id: sessionId,
    });
    send(ws, {
      type: 'assistant_response',
      text: 'Le bridge Hermes a rencontré une erreur en interrogeant le CLI local.',
      audio_url: '',
    });
  }
}

wss.on('connection', (ws, request) => {
  const origin = request.headers.origin || '';
  const remoteAddress = request.socket.remoteAddress || '';
  if (!isOriginAllowed(origin, remoteAddress)) {
    ws.close(1008, 'Origin not allowed');
    console.log(`[mock-vps-bridge] rejected connection from origin ${origin || 'none'} (${remoteAddress || 'unknown'})`);
    return;
  }

  const sessionId = `hermes-${sessionCounter++}`;
  sessions.set(ws, { sessionId, timers: [], activeChild: null, activeTimeout: null, activeRequestId: null, requestCounter: 0 });

  console.log(`[mock-vps-bridge] client connected ${sessionId} from ${request.socket.remoteAddress}`);

  send(ws, {
    type: 'status',
    text: 'Hermes bridge connecté',
    phase: 'remote_connect',
    session_id: sessionId,
  });
  emitState(ws, 'idle', 0.28, 'remote_live');
  send(ws, {
    type: 'assistant_response',
    text: 'Bridge Hermes prêt. Envoyez un transcript ou une commande texte pour interroger le CLI local.',
    audio_url: '',
  });

  ws.on('message', (raw) => {
    let message;
    try {
      message = JSON.parse(String(raw));
    } catch (error) {
      send(ws, {
        type: 'status',
        text: `JSON invalide: ${error.message}`,
        phase: 'remote_error',
        session_id: sessionId,
      });
      return;
    }

    if (message.type === 'client_hello') {
      send(ws, {
        type: 'status',
        text: `Bonjour ${message.client || 'voice-orb-client'}, session ${sessionId} prête`,
        phase: 'remote_live',
        session_id: sessionId,
      });
      return;
    }

    if (message.type === 'transcript_interim') {
      send(ws, {
        type: 'transcript_interim',
        text: message.text || '…',
      });
      emitState(ws, 'listening', 0.48, 'remote_live');
      return;
    }

    if (message.type === 'transcript_user') {
      handlePrompt(ws, sessionId, message.text, 'transcript');
      return;
    }

    if (message.type === 'text_command') {
      handlePrompt(ws, sessionId, message.text, 'command');
      return;
    }

    send(ws, {
      type: 'status',
      text: `Type non géré: ${message.type || 'inconnu'}`,
      phase: 'remote_error',
      session_id: sessionId,
    });
  });

  ws.on('close', () => {
    const session = sessions.get(ws);
    if (session) {
      cleanupSession(session);
      sessions.delete(ws);
    }
    console.log(`[mock-vps-bridge] client disconnected ${sessionId}`);
  });
});

wss.on('listening', () => {
  console.log(`[mock-vps-bridge] listening on ws://0.0.0.0:${PORT}`);
  console.log(`[mock-vps-bridge] using Hermes CLI: ${HERMES_BIN} (cwd=${HERMES_WORKDIR}, timeout=${HERMES_TIMEOUT_MS}ms)`);
  console.log(`[mock-vps-bridge] remote TTS: ${ENABLE_REMOTE_TTS && ELEVENLABS_API_KEY && ELEVENLABS_VOICE_ID ? `enabled (${ELEVENLABS_MODEL_ID})` : 'disabled'}`);
});
