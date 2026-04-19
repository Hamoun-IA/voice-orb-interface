# Voice Orb VPS Remote Transport Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Prepare the desktop/web client to connect to the VPS-hosted agent instead of assuming the agent runs locally.

**Architecture:** The renderer remains the visible cockpit while a transport client layer handles the remote session. First pass uses a configurable WebSocket endpoint with a thin message contract for state, transcripts, energy, and assistant replies.

**Tech Stack:** Existing HTML/CSS/JS UI + WebSocket client + local config persistence in the renderer.

---

## Scope

This slice prepares the client shell so it can:
- store a VPS endpoint
- connect/disconnect to a remote agent transport
- receive remote state/transcript/assistant messages
- send manual text commands over the transport for operator testing
- visually distinguish local demo mode from remote live mode
- ship with a lightweight mock bridge so the remote path is testable before the real VPS agent is wired in

---

## Message contract draft

### Outbound
- `client_hello`
- `transcript_user`
- `transcript_interim`
- `text_command`

### Inbound
- `status`
- `state`
- `transcript_user`
- `transcript_interim`
- `assistant_response`

### Example inbound state message
```json
{
  "type": "state",
  "state": "speaking",
  "energy": 0.81,
  "phase": "remote_live"
}
```

---

## Files
- Create: `web/remote-client.js`
- Modify: `web/index.html`
- Modify: `web/app.js`
- Modify: `web/styles.css`
- Create: `transport/mock-vps-bridge/package.json`
- Create: `transport/mock-vps-bridge/server.js`
- Modify: `README.md`

---

## Acceptance criteria
- UI exposes VPS connection controls
- endpoint persists locally
- connect/disconnect works from the renderer layer
- remote messages can drive state, transcript, and assistant text
- manual text commands can be sent over the remote transport
- lightweight mock bridge exists so the remote path can be tested before the real VPS agent is wired in
- local demo mode still works when remote is disconnected

---

## Local validation path
1. Start the mock bridge with `npm start` from `transport/mock-vps-bridge/`
2. Serve `web/` locally or launch the Electron shell
3. Point the local client to `ws://127.0.0.1:8787`
4. Connect and verify remote status, session id, and last event fields update
5. Send a manual text command and verify transcript + assistant response + orb state transitions update

## Public HTTPS validation path
1. Keep the mock bridge listening on `127.0.0.1:8787` / `0.0.0.0:8787`
2. Proxy the WebSocket through Caddy on `wss://test.hamoun.fun/ws/voice-orb`
3. Open `https://test.hamoun.fun`
4. Use `wss://test.hamoun.fun/ws/voice-orb` in the client
5. Confirm the browser connects without mixed-content errors
6. Send a manual text command and verify the same remote state transitions appear through the TLS path

---

## Next backend step
Swap the mock bridge behind the same WSS path for the real VPS transport endpoint while keeping the same message contract shape for state, transcript, assistant response, and manual text commands.