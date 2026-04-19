# Voice Orb Interface

Concept project for a futuristic voice UI built around a teal particle orb inspired by the provided reference image.

## Current direction
- browser prototype exists and is deployed on `test.hamoun.fun`
- target aesthetic: black void + teal particle ring + reactive core
- primary states: idle, listening, thinking, speaking
- next product branch: desktop overlay / PiP-like assistant mode
- important architecture rule: desktop app = remote client, agent = VPS

## Project paths
- Main plan: `docs/plans/2026-04-18-voice-orb-interface-plan.md`
- Desktop overlay plan: `docs/plans/2026-04-18-desktop-overlay-plan.md`
- VPS transport plan: `docs/plans/2026-04-18-vps-remote-transport-plan.md`
- Web prototype: `web/`
- Desktop shell: `desktop/`
- Hermes WebSocket bridge: `transport/mock-vps-bridge/`

## What this slice adds
- remote WebSocket connection controls remain in the existing UI
- remote operator metadata is now visible: connection status, mode, session, last event
- manual text commands can now be sent to the remote transport with a dedicated `text_command` event
- the bridge now calls the local Hermes CLI instead of returning only canned mock replies
- when ElevenLabs is configured, the bridge also generates a processed J.A.R.V.I.S.-style audio reply and sends its public `audio_url` back to the client
- demo mode, local speech loop, and manual orb state buttons still remain available when remote mode is inactive

## Run the Hermes WebSocket bridge
```bash
cd /root/projects/voice-orb-interface/transport/mock-vps-bridge
npm install
npm start
```

Exact runtime behavior:
- listens on port `8787` by default and is intended to sit behind Caddy on `wss://test.hamoun.fun/ws/voice-orb`
- accepts `client_hello`, `transcript_interim`, `transcript_user`, and `text_command`
- echoes `transcript_interim` / `transcript_user` back to the client in the existing message shape
- on `transcript_user` or `text_command`, emits thinking state, runs local Hermes CLI as a one-shot query, then sends `assistant_response`, `speaking`, and `idle`
- when ElevenLabs is available, the bridge also generates a processed remote audio file under `voice-cache/` and includes `audio_url` in `assistant_response`
- uses `hermes chat -Q -t search -q <wrapped user text>` under the hood and asks Hermes for plain-text output
- rejects browser origins outside the allowlist (`https://test.hamoun.fun`, `null`, and local HTTP test origins by default); origin-less clients are accepted only from loopback addresses

Default listener:
```text
ws://127.0.0.1:8787
```

Public TLS entrypoint already proxied by Caddy:
```text
wss://test.hamoun.fun/ws/voice-orb
```

Optional environment overrides:
```bash
PORT=8899 npm start
HERMES_BIN=/usr/local/bin/hermes HERMES_WORKDIR=/root HERMES_TIMEOUT_MS=60000 npm start
ALLOWED_ORIGINS='https://test.hamoun.fun,null,http://127.0.0.1:8080,http://localhost:8080' MAX_INPUT_CHARS=2000 npm start
ELEVENLABS_VOICE_ID=bnsgKUuzwdhkaM4KIIDH ELEVENLABS_MODEL_ID=eleven_v3 AUDIO_CACHE_DIR=/var/www/test.hamoun.fun/voice-cache PUBLIC_AUDIO_BASE_URL=https://test.hamoun.fun/voice-cache npm start
```

Notes:
- the bridge uses `spawn(..., shell: false)` to avoid shell interpolation/injection
- Hermes stdout/stderr are normalized before being forwarded to `assistant_response`; the CLI `session_id:` line and obvious tool-call/log noise are stripped before sending back to the client
- if ElevenLabs credentials and voice config are available, the bridge generates a processed remote OGG reply and serves it under `https://test.hamoun.fun/voice-cache/...`
- the web client prefers the real remote `audio_url`; if playback fails, it falls back to browser speech synthesis
- if Hermes exits non-zero or times out, the client receives `remote_error` status plus a fallback `assistant_response`
- the current protection layer is still lightweight: origin allowlisting and input-length caps reduce risk, but this remains a serious service and should stay behind your controlled domain/proxy

## Run the web client locally
Serve `web/` with any static HTTP server. Example with Python:
```bash
cd /root/projects/voice-orb-interface
python3 -m http.server 8080
```

Then open:
```text
http://127.0.0.1:8080/web/
```

For remote testing:
- set the WebSocket URL to `ws://127.0.0.1:8787` for local bridge testing from Electron or another local client
- use `wss://test.hamoun.fun/ws/voice-orb` from the public HTTPS site to avoid mixed-content blocking
- or point it to another `wss://<your-vps-host>/<path>` target if you proxy a different bridge on a VPS
- connect, then use the manual text command box to send test prompts

## Run the desktop shell
```bash
cd /root/projects/voice-orb-interface/desktop
npm install
npm start
```

If you launch Electron from a root/dev-container context, use:
```bash
npm run start:root
```
This fallback adds `--no-sandbox --disable-gpu` for headless/root environments where Electron otherwise complains theatrically.

The desktop shell still loads the existing `web/index.html` UI and now exposes the same remote controls as the browser build.

## Desktop/web smoke test flow
1. Start the Hermes bridge.
2. Start either the web client or the Electron shell.
3. Enter `ws://127.0.0.1:8787` in the VPS transport URL field.
4. Click **Connecter au VPS**.
5. Confirm the UI shows connected metadata and a Hermes session id.
6. Enter a manual text command and click **Envoyer au VPS**.
7. Confirm transcript, assistant text, and orb state transitions update from the remote messages.
8. Click **Couper le VPS** to return to local demo mode.

## Current limitation
This bridge is now practical for real replies via local Hermes CLI, but it is still a simple one-shot request bridge rather than a streaming, tool-aware, multi-turn remote agent transport.
