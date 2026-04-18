const CONFIG = {
  particleCount: 1900,
  ringRadius: 164,
  ribbonCount: 7,
};

const STATES = {
  idle: {
    label: 'Idle',
    energyBase: 0.24,
    energySwing: 0.06,
    pulseSpeed: 0.6,
    turbulence: 0.35,
    glow: 0.52,
    particleSpread: 18,
    orbitSpeed: 0.0012,
    breathing: 14,
  },
  listening: {
    label: 'Listening',
    energyBase: 0.34,
    energySwing: 0.18,
    pulseSpeed: 1.1,
    turbulence: 0.9,
    glow: 0.72,
    particleSpread: 28,
    orbitSpeed: 0.0022,
    breathing: 18,
  },
  thinking: {
    label: 'Thinking',
    energyBase: 0.58,
    energySwing: 0.16,
    pulseSpeed: 1.8,
    turbulence: 1.15,
    glow: 0.92,
    particleSpread: 34,
    orbitSpeed: 0.0034,
    breathing: 18,
  },
  speaking: {
    label: 'Speaking',
    energyBase: 0.44,
    energySwing: 0.26,
    pulseSpeed: 2.1,
    turbulence: 0.82,
    glow: 1.0,
    particleSpread: 26,
    orbitSpeed: 0.0028,
    breathing: 24,
  },
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
let micToggleBtn;
let demoToggleBtn;
let audioInput;
let audioMode = 'demo';

function setup() {
  canvasHost = document.getElementById('orb-canvas');
  stateLabelEl = document.getElementById('stateLabel');
  energyLabelEl = document.getElementById('energyLabel');
  audioModeLabelEl = document.getElementById('audioModeLabel');
  micStatusLabelEl = document.getElementById('micStatusLabel');
  micToggleBtn = document.getElementById('micToggleBtn');
  demoToggleBtn = document.getElementById('demoToggleBtn');
  audioInput = new AudioReactiveInput();

  const cnv = createCanvas(canvasHost.clientWidth, canvasHost.clientHeight);
  cnv.parent('orb-canvas');
  pixelDensity(1);
  colorMode(HSB, 360, 100, 100, 100);
  noStroke();

  randomSeed(42);
  noiseSeed(42);

  particles = Array.from({ length: CONFIG.particleCount }, (_, index) => new OrbParticle(index));
  bindControls();
  syncUI();
}

function draw() {
  const t = millis() * 0.001;
  updateAudioModeState(t);
  const state = STATES[currentState];

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
  micStatusLabelEl.textContent = audioInput.getStatus();
}

function updateAudioModeState(t) {
  if (audioMode === 'micro' && audioInput.isActive()) {
    const liveLevel = audioInput.getLevel();
    targetEnergy = constrain(0.14 + liveLevel * 1.18, 0.14, 1.28);

    if (liveLevel > 0.22) {
      currentState = 'speaking';
    } else if (liveLevel > 0.035) {
      currentState = 'listening';
    } else {
      currentState = 'idle';
    }

    syncUI();
    return;
  }

  currentState = manualState;
  const state = STATES[currentState];
  targetEnergy = computeDemoEnergy(state, t);
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
  const haloCount = 5;

  for (let i = haloCount; i >= 1; i--) {
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
      const noiseOffset = noise(
        cos(angle) * 1.15 + band * 0.13,
        sin(angle) * 1.15 + band * 0.13,
        t * 0.18 + band * 0.07
      );
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

  if (currentState === 'speaking') {
    const cadence = max(0, sin(t * 7.8)) * 0.22;
    return constrain(state.energyBase + slowWave + micro + cadence, 0.12, 1.25);
  }

  if (currentState === 'thinking') {
    const shimmer = noise(t * 0.9, 4.2) * 0.14;
    return constrain(state.energyBase + slowWave * 0.55 + shimmer, 0.18, 1.18);
  }

  if (currentState === 'listening') {
    const reactive = max(0, sin(t * 2.5) * 0.16) + noise(t * 1.6, 8.4) * 0.1;
    return constrain(state.energyBase + slowWave * 0.8 + reactive, 0.18, 1.1);
  }

  return constrain(state.energyBase + slowWave * 0.35 + micro * 0.45, 0.14, 0.7);
}

function bindControls() {
  const buttons = document.querySelectorAll('.state-btn[data-state]');
  buttons.forEach((button) => {
    button.addEventListener('click', () => setManualState(button.dataset.state));
  });

  micToggleBtn.addEventListener('click', handleMicrophoneToggle);
  demoToggleBtn.addEventListener('click', () => setAudioMode('demo'));
}

async function handleMicrophoneToggle() {
  if (audioMode === 'micro' && audioInput.isActive()) {
    setAudioMode('demo');
    return;
  }

  const started = await audioInput.startMicrophone();
  if (started) {
    setAudioMode('micro');
  } else {
    setAudioMode('demo');
    syncUI();
  }
}

function setManualState(nextState) {
  manualState = nextState;
  if (audioMode !== 'micro') {
    currentState = nextState;
  }
  syncUI();
}

function setAudioMode(nextMode) {
  audioMode = nextMode;

  if (nextMode === 'demo') {
    audioInput.stop();
    currentState = manualState;
  }

  syncUI();
}

function syncUI() {
  const state = STATES[currentState];
  stateLabelEl.textContent = state.label;
  audioModeLabelEl.textContent = audioMode === 'micro' ? 'Micro réel' : 'Démo interne';
  micStatusLabelEl.textContent = audioInput.getStatus();
  micToggleBtn.textContent = audioMode === 'micro' ? 'Couper le micro' : 'Activer le micro';
  demoToggleBtn.disabled = audioMode === 'demo';

  document.querySelectorAll('.state-btn[data-state]').forEach((button) => {
    const isActive = audioMode === 'micro'
      ? button.dataset.state === currentState
      : button.dataset.state === manualState;
    button.classList.toggle('active', isActive);
  });

  document.querySelectorAll('.state-btn[data-state]').forEach((button) => {
    button.disabled = audioMode === 'micro';
  });
}

function keyPressed() {
  if (audioMode === 'micro') return;
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
