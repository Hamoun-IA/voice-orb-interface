# Voice Orb Desktop Overlay Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Add a desktop version of the voice orb that can stay mini on the side of the screen like a PiP-style assistant overlay.

**Architecture:** Keep the current web UI as the rendering surface, then wrap it in a lightweight desktop shell. Crucially, the AI agent itself stays on the VPS; the desktop app is only the remote client/overlay. The best-fit first pass is an Electron shell with a transparent, frameless, always-on-top window, a compact mode, and click-through/interaction-safe controls, plus a future remote transport layer to talk to the VPS agent.

**Tech Stack:** Existing HTML/CSS/JS orb UI + Electron desktop shell + preload bridge for desktop controls + future remote API/WebSocket bridge to the VPS agent.

---

## Product brief

**Nom :** Voice Orb Desktop Overlay

**Objectif :** Permettre au voice orb de tourner comme une mini interface desktop persistante, flottante, toujours visible, discrète et élégante sur le côté de l’écran.

**Contexte :** Le prototype web fonctionne déjà sur `test.hamoun.fun` et dans le repo local. L’utilisateur veut maintenant une version desktop de type mini-overlay / PiP, laissée ouverte en permanence. Contrainte majeure découverte ensuite : l’agent tourne sur un VPS, pas sur le desktop utilisateur. La future app desktop doit donc agir comme client distant vers l’agent hébergé.

**Contraintes :**
- doit rester compacte et premium
- fenêtre sans chrome lourd
- comportement always-on-top
- possibilité de la réduire visuellement sans détruire la lisibilité
- réutiliser au maximum le rendu web existant
- prévoir un chemin vers tray/minimize/drag/lock plus tard

**Impact attendu :**
- transformer le prototype en assistant réellement posable sur le bureau
- permettre une présence continue sans monopoliser l’écran
- ouvrir la voie à une future vraie app locale voix + TTS + transcript

**Critères d’acceptation :**
- l’app desktop démarre localement
- une fenêtre overlay compacte s’ouvre
- la fenêtre est `always on top`
- le rendu conserve l’orbe et ses états
- un mode mini/compact fonctionne
- fermeture/réduction restent propres et prévisibles

---

## Impact analysis

### Existing areas touched
- `web/index.html`
- `web/styles.css`
- `web/app.js`
- `web/audio.js`
- `README.md`
- deployment script/docs may need clarification because desktop is local-only while web stays public

### New areas needed
- `desktop/package.json`
- `desktop/main.js`
- `desktop/preload.js`
- `desktop/assets/` for icons later
- desktop-specific README / run instructions
- future remote transport layer (`desktop/renderer API client`, auth/session config, VPS endpoint config)

### Regression risk
- **Low** for the public deployed web prototype if desktop shell is isolated under a new `desktop/` directory
- **Medium** if desktop mode requires changes in `web/*` for compact layout or desktop bridge hooks
- **Primary risk:** desktop-specific code polluting the web prototype or breaking mobile/web rendering

### Mitigation
- keep Electron files isolated in `desktop/`
- expose desktop-only behavior through feature detection (`window.voiceOrbDesktop`)
- make compact mode a CSS class or URL param, not a hard fork of the interface

---

## Recommended product behavior

### Window profile
- frameless
- transparent background where possible
- always-on-top
- resizable within safe min/max bounds
- draggable through a dedicated handle region
- compact default footprint (example: `420x760` first pass, then mini mode around `320x420`)

### Interaction model
- normal mode: visible side panel + transcript + controls
- mini mode: orb-centered reduced shell, minimal labels, tiny status strip
- the desktop shell is a **remote cockpit**: it must show state/transcript/controls while talking to the VPS-hosted agent, not pretend the agent lives locally
- later phase: tray icon, click-through idle mode, snap-left/snap-right presets

### Why Electron first
- fastest route from current web prototype to desktop behavior
- excellent control over PiP-adjacent window semantics
- transparent/frameless/always-on-top support is mature enough
- avoids wasting time pretending this requires a grand architectural rewrite

---

## Implementation slices

### Slice 1 — Desktop shell bootstrap
**Objective:** create the Electron wrapper and launch the existing UI locally.

**Files:**
- Create: `desktop/package.json`
- Create: `desktop/main.js`
- Create: `desktop/preload.js`
- Create: `desktop/.gitignore`

**Output:** `npm install && npm start` launches a desktop window showing the current orb UI.

### Slice 2 — Overlay window behavior
**Objective:** make the window behave like a real assistant overlay.

**Files:**
- Modify: `desktop/main.js`
- Modify: `desktop/preload.js`
- Modify: `web/index.html`
- Modify: `web/styles.css`

**Output:** frameless, always-on-top, compact-capable window with a drag handle and sane close/minimize controls.

### Slice 3 — Compact / mini mode
**Objective:** create the PiP-like side version.

**Files:**
- Modify: `web/index.html`
- Modify: `web/styles.css`
- Modify: `web/app.js`

**Output:** a reduced layout focused on the orb, state, and minimal transcript/status.

### Slice 4 — Docs and launch workflow
**Objective:** document how to run the desktop version and distinguish web/public vs local/desktop modes.

**Files:**
- Modify: `README.md`
- Create: `docs/desktop-mode.md`
- Create: `docs/decisions.md`
- Create: `docs/features.md`
- Create: `docs/regression-matrix.md`

**Output:** clear operator docs for local desktop use and future packaging.

---

## Verification checklist
- Electron starts without build tooling drama
- overlay window stays above normal windows
- compact mode is readable and visually coherent
- orb remains smooth and not cropped incorrectly
- desktop mode does not break the deployed web mode
- local microphone path still works inside desktop shell if permissions are granted

---

## Initial commands expected later
```bash
cd /root/projects/voice-orb-interface/desktop
npm install
npm start
```

---

## Recommended next action
Implement **Slice 1** first: bootstrap the Electron desktop shell around the current `web/` prototype, then validate always-on-top behavior before shrinking into true mini mode.
