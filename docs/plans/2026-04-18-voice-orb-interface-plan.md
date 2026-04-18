# Voice Orb Interface Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Build a futuristic voice interface centered on a teal particle orb/ring that reacts to listening, thinking, and speaking states.

**Architecture:** A browser-based voice UI shell renders a central particle halo with layered glow, concentric core, and audio-reactive motion. The visual system maps assistant state to motion profiles, brightness, density, and spectral pulse behavior while preserving a premium J.A.R.V.I.S.-style aesthetic.

**Tech Stack:** p5.js or WebGL canvas for the visual prototype, HTML/CSS shell, Web Audio API or mocked amplitude envelopes for voice-state simulation.

---

## Product brief

**Nom :** Voice Orb Interface

**Objectif :** Créer une interface vocale visuelle où la voix est représentée par un anneau/orbe de particules teal, élégant, dense, futuriste, lisible et réellement exploitable comme UI.

**Contexte :** Le visuel de référence montre un anneau énergétique composé de couches rubanées et de particules lumineuses, avec un noyau central discret. L'utilisateur veut reprendre cette direction comme identité d'une interface vocale.

**Contraintes :**
- rendu premium, pas gadget
- fond noir profond, palette teal/cyan dominante
- motion design lisible pour les états audio
- doit pouvoir évoluer vers une vraie interface vocale, pas seulement une animation décorative
- style cohérent avec une présence IA de type J.A.R.V.I.S.

**Impact attendu :**
- fournir une base visuelle immédiatement reconnaissable
- rendre la voix perceptible même sans texte
- servir de noyau à une future UI desktop/web/mobile/borne

**Critères d'acceptation :**
- un état idle convaincant
- un état listening nettement distinct
- un état thinking nettement distinct
- un état speaking synchronisable avec l'amplitude
- une hiérarchie visuelle claire entre noyau, halo, particules, glow
- une direction technique prête pour prototypage

---

## Visual language extracted from the reference

### Core ingredients
- **Primary geometry:** centered circular ring/orb
- **Texture:** dust-like particles + translucent ribbons
- **Depth:** multiple concentric layers and soft fog/glow
- **Palette:** black background + teal/cyan/aquamarine highlights
- **Mood:** technological, calm, surgical, almost biological

### Motion language
- **Idle:** slow breathing + orbital drift
- **Listening:** inward ripples, tighter agitation, localized peaks from incoming voice
- **Thinking:** faster inner orbit, denser folding, brighter core
- **Speaking:** outward pulses, more regular cadence, amplitude-linked deformation
- **Error/interruption:** brief collapse, color contamination toward white-amber, then reset

### State mapping
| State | Ring thickness | Particle speed | Core glow | Motion character |
|---|---:|---:|---:|---|
| Idle | thin | low | low | breath / drift |
| Listening | medium | reactive | medium | inward absorption |
| Thinking | dense | medium-high | high | orbital computation |
| Speaking | medium-high | rhythmic | medium-high | outward pulse |
| Error | unstable | bursty | flicker | collapse / distortion |

---

## Implementation slices

### Slice 1 — Visual prototype foundation
**Objective:** create a standalone prototype of the orb with synthetic state switching.

**Files:**
- Create: `web/index.html`
- Create: `web/styles.css`
- Create: `web/app.js`
- Create: `docs/visual-spec.md`

**Output:** clickable or keyboard-driven prototype cycling through idle/listening/thinking/speaking.

### Slice 2 — Audio-reactive speaking layer
**Objective:** drive pulse, glow, and particle agitation from real amplitude data.

**Files:**
- Modify: `web/app.js`
- Create: `web/audio.js`
- Create: `docs/audio-mapping.md`

**Output:** orb deformation and brightness respond to microphone/TTS amplitude.

### Slice 3 — Interface shell
**Objective:** wrap the orb in a minimal voice assistant UI.

**Files:**
- Modify: `web/index.html`
- Modify: `web/styles.css`
- Create: `docs/ui-shell.md`

**Output:** orb plus status text, transcript strip, mute/listen/talk controls.

### Slice 4 — Production hardening
**Objective:** stabilize performance and define integration points.

**Files:**
- Modify: `web/app.js`
- Create: `docs/integration-notes.md`
- Create: `docs/decisions.md`
- Create: `docs/features.md`
- Create: `docs/regression-matrix.md`

**Output:** documented behavior, performance notes, integration-ready state machine.

---

## Recommended rendering model

### Layer stack
1. **Background void** — black with subtle radial teal fog
2. **Outer particle torus** — moving dots with orbital noise
3. **Ribbon field** — semi-transparent wave bands crossing the ring
4. **Core iris** — concentric faint circles around a small nucleus
5. **Bloom pass** — additive highlights on energetic peaks
6. **HUD accents** — optional tiny marks / labels only if they do not pollute the composition

### Animation primitives
- perlin/fbm noise for ribbon displacement
- polar-coordinate particle distribution for the ring
- low-frequency sine envelopes for breathing
- amplitude envelope mapped to scale, brightness, density, and ripple speed
- easing curves for state transitions to avoid jumpy mode changes

### Initial palette
- `#020508` background
- `#0d1f24` ambient shadow teal
- `#3bd8d0` primary glow
- `#79fff3` highlight edge
- `#bafcff` transient peak

---

## UX rules
- the orb is the primary actor; UI chrome must remain secondary
- motion must communicate system state, not merely decorate the screen
- brightness peaks should be reserved for speech/output emphasis
- idle state should feel alive but not distracting
- transcript and controls should sit outside the energy ring and never cut through it

---

## Verification checklist
- orb reads clearly on a dark screen from a distance
- state changes are distinguishable without labels
- speaking pulse is synchronized and not random
- particle density remains elegant, not muddy
- frame rate stays smooth on target hardware

---

## Next recommended action
Start with **Slice 1** as a browser prototype in the new project folder, then review the visual language before connecting real audio input.
