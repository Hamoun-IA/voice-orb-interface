const CONFIG = {
  particleCount: 1900,
  ringRadius: 164,
  ribbonCount: 7,
};

const STATES = {
  idle: { label: 'Idle', energyBase: 0.24, energySwing: 0.06, pulseSpeed: 0.6, turbulence: 0.35, glow: 0.52, particleSpread: 18, orbitSpeed: 0.0012, breathing: 14 },
  listening: { label: 'Listening', energyBase: 0.34, energySwing: 0.18, pulseSpeed: 1.1, turbulence: 0.9, glow: 0.72, particleSpread: 28, orbitSpeed: 0.0022, breathing: 18 },
  thinking: { label: 'Thinking', energyBase: 0.58, energySwing: 0.16, pulseSpeed: 1.8, turbulence: 1.15, glow: 0.92, particleSpread: 34, orbitSpeed: 0.0034, breathing: 18 },
  speaking: { label: 'Speaking', energyBase: 0.44, energySwing: 0.26, pulseSpeed: 2.1, turbulence: 0.82, glow: 1.0, particleSpread: 26, orbitSpeed: 0.0028, breathing: 24 },
};

const PHASE_LABELS = {
  standby: 'Standby',
  local_demo: 'Démo locale',
  local_live: 'Boucle locale',
  remote_connect: 'Connexion VPS',
  remote_live: 'VPS en ligne',
  remote_error: 'Erreur VPS',
};

let particles = [];
let currentState = 'idle';
let manualState = 'idle';
let targetEnergy = STATES.idle.energyBase;
let smoothedEnergy = STATES.idle.energyBase;
let canvasHost;
let stateLabelEl;
let energyLabelEl;
let audioModeLabelEl;
let micStatusLabelEl;
let recognitionLabelEl;
let systemPhaseLabelEl;
let userTranscriptEl;
let interimTranscriptEl;
let assistantTranscriptEl;
let remoteStatusLabelEl;
let remoteModeLabelEl;
let remoteLastEventLabelEl;
let remoteSessionLabelEl;
let remoteUrlInput;
let remoteCommandInput;
let remoteConnectBtn;
let remoteDisconnectBtn;
let remoteSendBtn;
let micToggleBtn;
let demoToggleBtn;
let audioInput;
let speechLoop;
let remoteClient;
let audioMode = 'demo';
let systemPhase = 'standby';
let remoteActive = false;
let remoteConnectionState = 'disconnected';
let pendingLocalReplyTimeout = null;
let localFlowToken = 0;
let localAssistantActive = false;
let remoteAudioPlayer = null;
let remoteSpeakingActive = false;

function setup() {
  canvasHost = document.getElementById('orb-canvas');
  stateLabelEl = document.getElementById('stateLabel');
  energyLabelEl = document.getElementById('energyLabel');
  audioModeLabelEl = document.getElementById('audioModeLabel');
  micStatusLabelEl = document.getElementById('micStatusLabel');
  recognitionLabelEl = document.getElementById('recognitionLabel');
  systemPhaseLabelEl = document.getElementById('systemPhaseLabel');
  userTranscriptEl = document.getElementById('userTranscript');
  interimTranscriptEl = document.getElementById('interimTranscript');
  assistantTranscriptEl = document.getElementById('assistantTranscript');
  remoteStatusLabelEl = document.getElementById('remoteStatusLabel');
  remoteModeLabelEl = document.getElementById('remoteModeLabel');
  remoteLastEventLabelEl = document.getElementById('remoteLastEventLabel');
  remoteSessionLabelEl = document.getElementById('remoteSessionLabel');
  remoteUrlInput = document.getElementById('remoteUrlInput');
  remoteCommandInput = document.getElementById('remoteCommandInput');
  remoteConnectBtn = document.getElementById('remoteConnectBtn');
  remoteDisconnectBtn = document.getElementById('remoteDisconnectBtn');
  remoteSendBtn = document.getElementById('remoteSendBtn');
  micToggleBtn = document.getElementById('micToggleBtn');
  demoToggleBtn = document.getElementById('demoToggleBtn');

  audioInput = new AudioReactiveInput();
  speechLoop = createSpeechLoop();
  remoteClient = createRemoteClient();

  const cnv = createCanvas(canvasHost.clientWidth, canvasHost.clientHeight);
  cnv.parent('orb-canvas');
  pixelDensity(1);
  colorMode(HSB, 360, 100, 100, 100);
  noStroke();

  randomSeed(42);
  noiseSeed(42);

  particles = Array.from({ length: CONFIG.particleCount }, (_, index) => new OrbParticle(index));
  hydrateRemoteConfig();
  bindControls();
  setSystemPhase('local_demo');
  syncRemoteMeta(remoteClient.getConnectionState());
  syncUI();
}

function createSpeechLoop() {
  return new BrowserSpeechLoop({
    onInterim: (text) => {
      interimTranscriptEl.textContent = text || '…';
      recognitionLabelEl.textContent = text ? 'Interim actif' : speechLoop.getStatus();
      if (remoteActive) remoteClient.send({ type: 'transcript_interim', text });
    },
    onFinal: (text) => handleUserTranscript(text, { source: 'local' }),
    onState: (state) => {
      if (!remoteActive) currentState = state;
      if (state === 'listening' && !remoteActive) setSystemPhase('local_live');
      syncUI();
    },
    onError: (message) => {
      recognitionLabelEl.textContent = message;
      if (!remoteActive) setSystemPhase('standby');
      syncUI();
    },
  });
}

function createRemoteClient() {
  return new VoiceOrbRemoteClient({
    onStatus: (text) => {
      remoteStatusLabelEl.textContent = text;
    },
    onState: (state) => {
      if (remoteSpeakingActive && state !== 'speaking') return;
      if (STATES[state]) currentState = state;
      syncUI();
    },
    onTranscript: (text) => {
      userTranscriptEl.textContent = text || 'Aucune entrée utilisateur.';
      recognitionLabelEl.textContent = 'Transcript VPS';
    },
    onInterim: (text) => {
      interimTranscriptEl.textContent = text || '…';
      if (text) recognitionLabelEl.textContent = 'Interim VPS';
    },
    onAssistant: (text, audioUrl) => {
      assistantTranscriptEl.textContent = text || 'Aucune réponse assistant.';
      if (remoteActive && text) {
        playRemoteAssistantReply(text, audioUrl);
      }
    },
    onEnergy: (value) => {
      if (typeof value === 'number') targetEnergy = constrain(value, 0.14, 1.3);
    },
    onPhase: (phase) => setSystemPhase(phase),
    onError: (message) => {
      remoteStatusLabelEl.textContent = message;
      setSystemPhase('remote_error');
      syncUI();
    },
    onConnectionChange: (state) => {
      syncRemoteMeta(state);
      syncUI();
    },
    onRemoteEvent: (eventLabel) => {
      remoteLastEventLabelEl.textContent = eventLabel || 'Aucun';
    },
    onSession: (sessionId) => {
      remoteSessionLabelEl.textContent = sessionId ? `session ${sessionId}` : 'Aucune session distante';
    },
  });
}

function hydrateRemoteConfig() {
  const config = remoteClient.loadConfig();
  remoteUrlInput.value = config.url || '';
}

function draw() {
  const t = millis() * 0.001;
  updateModeState(t);
  const state = STATES[currentState] || STATES.idle;

  smoothedEnergy = lerp(smoothedEnergy, targetEnergy, audioMode === 'micro' ? 0.12 : 0.065);

  renderVoid(t, smoothedEnergy);
  push();
  translate(width / 2, height / 2);
  drawHalo(t, state, smoothedEnergy);
  drawRibbons(t, state, smoothedEnergy);
  drawParticles(t, state, smoothedEnergy);
  drawCore(t, state, smoothedEnergy);
  pop();

  energyLabelEl.textContent = smoothedEnergy.toFixed(2);
  if (!remoteActive) micStatusLabelEl.textContent = audioInput.getStatus();
}

function updateModeState(t) {
  if (remoteActive) {
    audioMode = 'remote';
    return;
  }

  if (audioMode === 'micro' && audioInput.isActive()) {
    if (localAssistantActive) {
      targetEnergy = computeDemoEnergy(STATES[currentState], t);
    } else {
      const liveLevel = audioInput.getLevel();
      targetEnergy = constrain(0.14 + liveLevel * 1.18, 0.14, 1.28);

      if (liveLevel > 0.22) currentState = 'speaking';
      else if (liveLevel > 0.035) currentState = 'listening';
      else currentState = 'idle';
    }

    syncUI();
    return;
  }

  currentState = manualState;
  targetEnergy = computeDemoEnergy(STATES[currentState], t);
}

function handleUserTranscript(text, { source = 'local' } = {}) {
  if (!text) return;
  userTranscriptEl.textContent = text;
  interimTranscriptEl.textContent = '…';
  recognitionLabelEl.textContent = source === 'remote' ? 'Transcript VPS' : speechLoop.getStatus();

  if (remoteActive) {
    remoteClient.send({ type: 'transcript_user', text });
    return;
  }

  cancelLocalAssistantFlow({ preserveAssistantText: true });
  const flowToken = ++localFlowToken;
  const reply = buildAssistantReply(text);
  localAssistantActive = true;
  setSystemPhase('local_live');
  currentState = 'thinking';
  assistantTranscriptEl.textContent = 'Analyse en cours…';

  pendingLocalReplyTimeout = setTimeout(() => {
    if (remoteActive || flowToken !== localFlowToken) return;

    currentState = 'speaking';
    assistantTranscriptEl.textContent = reply;
    speechLoop.speak(reply, {
      onStart: () => {
        if (remoteActive || flowToken !== localFlowToken) return;
        currentState = 'speaking';
        setSystemPhase('local_live');
        syncUI();
      },
      onEnd: () => {
        if (flowToken !== localFlowToken || remoteActive) return;
        localAssistantActive = false;
        currentState = audioInput.isActive() ? 'listening' : 'idle';
        syncUI();
      },
    });
    pendingLocalReplyTimeout = null;
    syncUI();
  }, 520);
}

function cancelLocalAssistantFlow({ preserveAssistantText = false } = {}) {
  localFlowToken += 1;
  localAssistantActive = false;
  remoteSpeakingActive = false;

  if (pendingLocalReplyTimeout) {
    clearTimeout(pendingLocalReplyTimeout);
    pendingLocalReplyTimeout = null;
  }

  stopRemoteAssistantAudio();
  speechLoop.cancelSpeech();

  if (!preserveAssistantText) {
    assistantTranscriptEl.textContent = 'En attente d’un échange utile, ce qui me laisse un rare instant de paix.';
  }
}

function stopRemoteAssistantAudio() {
  if (!remoteAudioPlayer) return;
  try {
    remoteAudioPlayer.pause();
    remoteAudioPlayer.currentTime = 0;
  } catch (_error) {
    // ignore audio cleanup quirks
  }
  remoteAudioPlayer = null;
}

function playRemoteAssistantSpeechFallback(text) {
  recognitionLabelEl.textContent = 'Réponse VPS';
  speechLoop.speak(text, {
    onStart: () => {
      if (!remoteActive) return;
      currentState = 'speaking';
      setSystemPhase('remote_live');
      syncUI();
    },
    onEnd: () => {
      remoteSpeakingActive = false;
      if (!remoteActive) return;
      currentState = 'idle';
      syncUI();
    },
  });
}

function playRemoteAssistantReply(text, audioUrl = '') {
  if (!text || !remoteActive) return;

  stopRemoteAssistantAudio();
  speechLoop.cancelSpeech();
  remoteSpeakingActive = true;
  currentState = 'speaking';
  recognitionLabelEl.textContent = audioUrl ? 'Audio JARVIS VPS' : 'Réponse VPS';
  syncUI();

  if (!audioUrl) {
    playRemoteAssistantSpeechFallback(text);
    return;
  }

  const audio = new Audio(audioUrl);
  audio.preload = 'auto';
  remoteAudioPlayer = audio;

  const finalizeAudio = () => {
    if (remoteAudioPlayer !== audio) return;
    remoteAudioPlayer = null;
    remoteSpeakingActive = false;
    if (!remoteActive) return;
    currentState = 'idle';
    syncUI();
  };

  audio.addEventListener('play', () => {
    if (!remoteActive || remoteAudioPlayer !== audio) return;
    currentState = 'speaking';
    setSystemPhase('remote_live');
    syncUI();
  }, { once: true });
  audio.addEventListener('ended', finalizeAudio, { once: true });
  audio.addEventListener('error', () => {
    if (remoteAudioPlayer !== audio) return;
    remoteAudioPlayer = null;
    playRemoteAssistantSpeechFallback(text);
  }, { once: true });

  const playPromise = audio.play();
  if (playPromise && typeof playPromise.catch === 'function') {
    playPromise.catch(() => {
      if (remoteAudioPlayer !== audio) return;
      remoteAudioPlayer = null;
      playRemoteAssistantSpeechFallback(text);
    });
  }
}

function buildAssistantReply(text) {
  const normalized = text.toLowerCase();
  if (normalized.includes('bonjour') || normalized.includes('salut')) {
    return 'Bonjour Monsieur. Liaison locale stable. L’orbe reste opérationnel et prêt pour la future connexion distante au VPS.';
  }
  if (normalized.includes('vps') || normalized.includes('serveur')) {
    return 'Le desktop restera un cockpit local, Monsieur. Le cerveau, lui, demeurera sur le VPS. Ce qui est infiniment moins stupide.';
  }
  return `Reçu, Monsieur. Transcript local capté : ${text}. La couche distante VPS est en préparation, ce qui nous évitera de confondre l’interface avec le cerveau.`;
}

function setSystemPhase(phase) {
  systemPhase = phase;
  systemPhaseLabelEl.textContent = PHASE_LABELS[phase] || phase;
}

function syncRemoteMeta(state) {
  const nextState = state || remoteClient.getConnectionState();
  remoteConnectionState = nextState.connectionState || 'disconnected';
  remoteActive = Boolean(nextState.connected);

  const modeLabelMap = {
    disconnected: 'Hors ligne',
    connecting: 'Connexion',
    connected: 'Actif',
    error: 'Erreur',
  };

  remoteModeLabelEl.textContent = modeLabelMap[remoteConnectionState] || remoteConnectionState;
  remoteLastEventLabelEl.textContent = nextState.lastEvent || 'Aucun';
  remoteSessionLabelEl.textContent = nextState.sessionId ? `session ${nextState.sessionId}` : 'Aucune session distante';

  if (remoteConnectionState === 'connecting') {
    audioModeLabelEl.textContent = 'Client distant';
    micStatusLabelEl.textContent = 'Liaison VPS…';
    return;
  }

  if (remoteActive) {
    audioMode = 'remote';
    audioModeLabelEl.textContent = 'Client distant';
    micStatusLabelEl.textContent = 'VPS lié';
  } else {
    if (audioMode === 'remote') {
      audioMode = 'demo';
    }
    if (audioMode !== 'micro') {
      audioModeLabelEl.textContent = 'Démo interne';
      micStatusLabelEl.textContent = audioInput.getStatus();
    }
  }
}

function renderVoid(t, energy) {
  background(210, 54, 3, 100);
  for (let i = 0; i < 3; i++) {
    const alpha = 12 + i * 5 + energy * 10;
    const radius = width * (0.22 + i * 0.13) + sin(t * (0.33 + i * 0.11)) * 18;
    fill(184, 70, 28 + i * 8, alpha);
    circle(width / 2, height / 2, radius * 2);
  }
  fill(184, 55, 12, 16);
  rect(0, 0, width, height);
}

function drawHalo(t, state, energy) {
  blendMode(ADD);
  const baseRadius = CONFIG.ringRadius + state.breathing * sin(t * state.pulseSpeed);
  for (let i = 5; i >= 1; i--) {
    const radius = baseRadius + i * (22 + energy * 8);
    const alpha = (state.glow * 8) / i;
    fill(178, 68, 100, alpha);
    circle(0, 0, radius * 2.26);
  }
  blendMode(BLEND);
}

function drawRibbons(t, state, energy) {
  noFill();
  blendMode(ADD);
  for (let band = 0; band < CONFIG.ribbonCount; band++) {
    const radius = CONFIG.ringRadius - 30 + band * 10 + sin(t * 0.7 + band) * 3;
    const alpha = 18 + band * 1.2 + state.glow * 10 + energy * 6;
    stroke(180 + band * 1.2, 55 - band * 2.2, 98, alpha);
    strokeWeight(band % 2 === 0 ? 1.2 : 0.8);
    beginShape();
    for (let step = 0; step <= 180; step++) {
      const angle = (step / 180) * TWO_PI;
      const noiseOffset = noise(cos(angle) * 1.15 + band * 0.13, sin(angle) * 1.15 + band * 0.13, t * 0.18 + band * 0.07);
      const turbulence = map(noiseOffset, 0, 1, -state.particleSpread, state.particleSpread) * (0.45 + state.turbulence * 0.35);
      const wave = sin(angle * (3 + band * 0.35) + t * (state.pulseSpeed * 0.8) + band) * (4 + energy * 14);
      const r = radius + turbulence + wave;
      vertex(cos(angle) * r, sin(angle) * r * (0.92 + band * 0.012));
    }
    endShape(CLOSE);
  }
  blendMode(BLEND);
  noStroke();
}

function drawParticles(t, state, energy) {
  blendMode(ADD);
  for (const particle of particles) {
    particle.update(t, state, energy);
    particle.display();
  }
  blendMode(BLEND);
}

function drawCore(t, state, energy) {
  blendMode(ADD);
  const pulse = 28 + sin(t * state.pulseSpeed * 1.5) * (6 + energy * 16);
  fill(184, 26, 16, 20 + state.glow * 10);
  circle(0, 0, 240 + energy * 40);
  stroke(183, 42, 94, 20 + state.glow * 12 + energy * 10);
  strokeWeight(1);
  noFill();
  circle(0, 0, 114 + pulse * 0.35);
  circle(0, 0, 74 + pulse * 0.16);
  circle(0, 0, 32 + pulse * 0.08);
  noStroke();
  fill(186, 30, 100, 56 + state.glow * 18 + energy * 10);
  circle(0, 0, 18 + energy * 18);
  fill(186, 18, 100, 18 + energy * 3);
  circle(0, 0, 44 + energy * 16);
  blendMode(BLEND);
}

function computeDemoEnergy(state, t) {
  const slowWave = sin(t * state.pulseSpeed) * state.energySwing;
  const micro = sin(t * state.pulseSpeed * 3.3 + 0.7) * state.energySwing * 0.22;
  if (currentState === 'speaking') return constrain(state.energyBase + slowWave + micro + max(0, sin(t * 7.8)) * 0.22, 0.12, 1.25);
  if (currentState === 'thinking') return constrain(state.energyBase + slowWave * 0.55 + noise(t * 0.9, 4.2) * 0.14, 0.18, 1.18);
  if (currentState === 'listening') return constrain(state.energyBase + slowWave * 0.8 + max(0, sin(t * 2.5) * 0.16) + noise(t * 1.6, 8.4) * 0.1, 0.18, 1.1);
  return constrain(state.energyBase + slowWave * 0.35 + micro * 0.45, 0.14, 0.7);
}

function bindControls() {
  document.querySelectorAll('.state-btn[data-state]').forEach((button) => {
    button.addEventListener('click', () => setManualState(button.dataset.state));
  });
  micToggleBtn.addEventListener('click', handleMicrophoneToggle);
  demoToggleBtn.addEventListener('click', () => setAudioMode('demo'));
  remoteConnectBtn.addEventListener('click', handleRemoteConnect);
  remoteDisconnectBtn.addEventListener('click', handleRemoteDisconnect);
  remoteSendBtn.addEventListener('click', handleRemoteSend);
  remoteCommandInput.addEventListener('keydown', (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      event.preventDefault();
      handleRemoteSend();
    }
  });
}

async function handleMicrophoneToggle() {
  if (remoteActive) return;
  if (audioMode === 'micro' && audioInput.isActive()) {
    setAudioMode('demo');
    return;
  }
  const micStarted = await audioInput.startMicrophone();
  if (!micStarted) {
    setAudioMode('demo');
    syncUI();
    return;
  }
  const recognitionStarted = speechLoop.startListening();
  recognitionLabelEl.textContent = recognitionStarted ? speechLoop.getStatus() : 'Reconnaissance indisponible';
  setAudioMode('micro');
}

function handleRemoteConnect() {
  const url = remoteUrlInput.value.trim();
  remoteClient.saveConfig(url);
  cancelLocalAssistantFlow({ preserveAssistantText: true });
  const started = remoteClient.connect(url);
  if (started) {
    audioInput.stop();
    speechLoop.stopListening();
    recognitionLabelEl.textContent = 'Piloté par le VPS';
    assistantTranscriptEl.textContent = 'En attente d’une réponse distante…';
    syncUI();
  }
}

function handleRemoteDisconnect() {
  remoteClient.disconnect();
  setAudioMode('demo');
}

function handleRemoteSend() {
  const text = remoteCommandInput.value.trim();
  if (!text) {
    remoteStatusLabelEl.textContent = 'Commande texte vide';
    return;
  }
  if (!remoteActive) {
    remoteStatusLabelEl.textContent = 'Connectez-vous au VPS avant envoi';
    return;
  }

  userTranscriptEl.textContent = text;
  interimTranscriptEl.textContent = '…';
  assistantTranscriptEl.textContent = 'Transmission au VPS…';
  recognitionLabelEl.textContent = 'Commande distante';
  const sent = remoteClient.sendManualText(text);
  if (sent) {
    remoteCommandInput.value = '';
  }
}

function setManualState(nextState) {
  manualState = nextState;
  if (audioMode !== 'micro' && !remoteActive) currentState = nextState;
  syncUI();
}

function setAudioMode(nextMode) {
  audioMode = nextMode;
  if (nextMode === 'demo') {
    cancelLocalAssistantFlow({ preserveAssistantText: true });
    audioInput.stop();
    speechLoop.stopListening();
    currentState = manualState;
    recognitionLabelEl.textContent = speechLoop.getStatus();
    micStatusLabelEl.textContent = audioInput.getStatus();
    audioModeLabelEl.textContent = 'Démo interne';
    if (!remoteActive) setSystemPhase('local_demo');
  } else if (nextMode === 'micro') {
    audioModeLabelEl.textContent = 'Boucle locale';
    setSystemPhase('local_live');
  } else if (nextMode === 'remote') {
    cancelLocalAssistantFlow({ preserveAssistantText: true });
    audioModeLabelEl.textContent = 'Client distant';
    setSystemPhase(remoteConnectionState === 'connecting' ? 'remote_connect' : 'remote_live');
  }
  syncUI();
}

function syncUI() {
  const state = STATES[currentState] || STATES.idle;
  stateLabelEl.textContent = state.label;
  energyLabelEl.textContent = smoothedEnergy.toFixed(2);
  if (!remoteActive) {
    micStatusLabelEl.textContent = audioInput.getStatus();
  }

  if (remoteActive) {
    micToggleBtn.textContent = 'Boucle locale indisponible';
  } else if (audioMode === 'micro' && audioInput.isActive()) {
    micToggleBtn.textContent = 'Couper la boucle vocale';
  } else {
    micToggleBtn.textContent = 'Activer la boucle vocale';
  }

  demoToggleBtn.disabled = audioMode === 'demo' && !remoteActive;
  remoteDisconnectBtn.disabled = !remoteActive && remoteConnectionState !== 'connecting';
  remoteConnectBtn.disabled = remoteActive || remoteConnectionState === 'connecting';
  remoteSendBtn.disabled = !remoteActive;
  remoteCommandInput.disabled = !remoteActive;
  micToggleBtn.disabled = remoteActive || remoteConnectionState === 'connecting';

  document.querySelectorAll('.state-btn[data-state]').forEach((button) => {
    const isActive = audioMode === 'micro' ? button.dataset.state === currentState : button.dataset.state === manualState;
    button.classList.toggle('active', isActive);
    button.disabled = audioMode === 'micro' || remoteActive || remoteConnectionState === 'connecting';
  });
}

function keyPressed() {
  if (audioMode === 'micro' || remoteActive || remoteConnectionState === 'connecting') return;
  if (key === '1') setManualState('idle');
  if (key === '2') setManualState('listening');
  if (key === '3') setManualState('thinking');
  if (key === '4') setManualState('speaking');
}

function windowResized() {
  resizeCanvas(canvasHost.clientWidth, canvasHost.clientHeight);
}

class OrbParticle {
  constructor(index) {
    this.index = index;
    this.seed = random(1000);
    this.angle = random(TWO_PI);
    this.radiusOffset = random(-28, 28);
    this.size = random(1.2, 3.8);
    this.depth = random(0.65, 1.4);
  }

  update(t, state, energy) {
    this.angle += state.orbitSpeed * this.depth * 18;
    const orbitNoise = noise(this.seed, t * 0.18, this.index * 0.002);
    const wave = sin(this.angle * 3 + t * state.pulseSpeed * 1.1 + this.seed) * (4 + energy * 10);
    const drift = map(orbitNoise, 0, 1, -state.particleSpread, state.particleSpread);
    const radius = CONFIG.ringRadius + this.radiusOffset + drift + wave;
    const elliptic = 0.88 + noise(this.seed, t * 0.06) * 0.22;
    this.x = cos(this.angle) * radius;
    this.y = sin(this.angle) * radius * elliptic;
    this.alpha = 20 + state.glow * 25 + this.depth * 12 + energy * 18;
    this.brightness = 72 + this.depth * 16 + energy * 16;
    this.hue = 176 + noise(this.seed, t * 0.2) * 16;
  }

  display() {
    fill(this.hue, 48, this.brightness, this.alpha);
    circle(this.x, this.y, this.size * this.depth);
    if (this.depth > 1.16) {
      fill(this.hue + 6, 28, 100, this.alpha * 0.16);
      circle(this.x, this.y, this.size * this.depth * 4.2);
    }
  }
}
