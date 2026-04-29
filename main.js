(function () {
  "use strict";

  const STAGE = Object.freeze({ width: 1600, height: 900, aspect: 16 / 9 });
  const MAX_DEVICE_PIXEL_RATIO = 2;
  const STATIC_PULSE = 1.35;
  const OUTLINE_DOT_SPACING = 19.4;
  const OUTLINE_WAVE_COUNT = 4;
  const OUTLINE_WAVELET_DOTS = 10;
  const OUTLINE_IDLE_WAVE_STATE = "level5";
  const OUTLINE_WAVELET_STATES = Object.freeze([
    "level10",
    "level9",
    "level8",
    "level7",
    "level6",
    "level5",
    "level4",
    "level3",
    "level2",
    "level2",
  ]);
  const MOVING_OUTLINE_FRAME_MS = 100;
  const MOVING_OUTLINE_MIN_MS = 900;
  const MOVING_OUTLINE_SPEED_PER_MS = 0.00018;
  const STANDBY_OUTLINE_FRAME_MS = 250;
  const STANDBY_OUTLINE_CYCLE_MS = 5200;
  const STANDBY_OUTLINE_WAVE_COUNT = 7;
  const STANDBY_OUTLINE_WAVE_SPACING = 0.145;
  const POWER_DOT_PULSE_MS = 80;
  const SHOOT_TARGET_BLINK_MS = 520;
  const TARGET_ARC_CYCLE_MS = 2000;
  const TARGET_ARC_FRAME_MS = 140;
  const GAME_START_OUTLINE_BLINK_MS = 520;
  const DIRTY_REPAINT_PADDING = 48;
  const AUDIO = Object.freeze({
    chargeFadeMs: 90,
    chargeVolume: 0.065,
    enemyTickMaxMs: 1050,
    enemyTickMinMs: 120,
    enemyTickVolume: 0.22,
    enemyTickMinSpeakerGain: 0.035,
    enemyTickPanPower: 2.25,
    enemyTickPanWidth: 18,
    enemyTickStereoDistanceDrop: 0.68,
    gameStartVolume: 0.42,
    gameOverVolume: 0.34,
    masterVolume: 1,
    shootVolume: 0.4,
  });

  const LAYOUT = Object.freeze({
    panel: { x: 48, y: 174, width: 1504, height: 132, chamfer: 28 },
    lane: {
      y: 241,
      inset: 172,
      spacing: 13.2,
      exclusions: [
        { centerX: 158, radius: 58 },
        { centerX: STAGE.width - 158, radius: 58 },
      ],
    },
    arrowTipInset: 76,
    bikeInset: 158,
    bikeY: 241,
    targetCenterX: STAGE.width / 2,
    target: {
      outerRadius: 39,
      outerSpacing: 6.8,
      outerDotRadius: 1.65,
      innerRadius: 21,
      innerLineWidth: 4.4,
      outerLaneClearance: 14,
      innerLaneClearance: 11,
    },
    powerColumn: { top: 331, rowGap: 28, rows: 18, columns: 15, colGap: 7.5 },
    timer: { x: 1518, y: 92 },
  });

  const DIRTY_RECTS = Object.freeze({
    outline: { x: 0, y: 126, width: STAGE.width, height: 226 },
    target: { x: 710, y: 174, width: 180, height: 138 },
  });

  const STATES = Object.freeze({
    off: { alpha: 0, glow: 0 },
    level1: { alpha: 0.16, glow: 0.35 },
    level2: { alpha: 0.34, glow: 0.55 },
    level3: { alpha: 0.55, glow: 0.85 },
    level4: { alpha: 0.78, glow: 1.25 },
    level5: { alpha: 1, glow: 1.95 },
    level6: { alpha: 1, glow: 2.2 },
    level7: { alpha: 1, glow: 2.45 },
    level8: { alpha: 1, glow: 2.7 },
    level9: { alpha: 1, glow: 2.95 },
    level10: { alpha: 1, glow: 3.2 },
    powerMain: { alpha: 0.58, glow: 1.05 },
    powerPeak: { alpha: 1, glow: 5.6 },
    enemy1: { alpha: 0.08, glow: 0.05 },
    enemy2: { alpha: 0.13, glow: 0.1 },
    enemy3: { alpha: 0.21, glow: 0.2 },
    enemy4: { alpha: 0.32, glow: 0.38 },
    enemy5: { alpha: 0.46, glow: 0.68 },
    enemy6: { alpha: 0.62, glow: 1.15 },
    enemy7: { alpha: 0.78, glow: 1.85 },
    enemy8: { alpha: 0.9, glow: 2.8 },
    enemy9: { alpha: 1, glow: 4.2 },
    enemy10: { alpha: 1, glow: 6.1 },
  });

  const ENEMY_COLORS = Object.freeze([
    "#4d1118",
    "#6b1719",
    "#8d1d18",
    "#b92714",
    "#e13716",
    "#ff4a1f",
    "#ff6232",
    "#ff7c48",
    "#ff9f65",
    "#ffd0a0",
  ]);

  const COLORS = Object.freeze({
    blue: "#4790ff",
    cyanBlue: "#30a2ff",
    laneOff: "#7f8790",
    powerOff: "#3c186f",
    red: "#ff433e",
    purple: "#8b32ff",
    violetWhite: "#f0dbff",
    wall: "#f6fbff",
  });

  const STATE_TOOLS = window.LedDefenseState ?? Object.freeze({
    DISPLAY_MODES: { TARGET: "target", FOV: "fov" },
    OUTLINE_EFFECT_MODES: { NONE: "none", SAME: "same", REVERSE: "reverse" },
    GAME: {
      displayPadding: 0,
      fovWallPadding: 2,
      displaySlots: 88,
      enemyWidth: 4,
      gameOverAllBlinkMs: 560,
      gameOverEnemyBlinkMs: 3000,
      gameOverResetPauseMs: 700,
      gameStartCountdownMs: 3300,
      gameStartNoteMs: 1000,
      maxDistance: 10,
      maxPlayerMovePerStep: 2,
      movementImpulseMs: 900,
      movementSettleMs: 60,
      movementStepMs: 250,
      playerWidth: 4,
      playfieldSlots: 88,
      tickMs: 2000,
    },
    POWER: { fireHoldMs: 160, maxLevel: LAYOUT.powerColumn.rows },
    normalizeState: (value = {}) => ({
      powerLevel: Math.max(0, Math.min(LAYOUT.powerColumn.rows, Math.round(Number(value.powerLevel ?? value.purpleLevel ?? 0)))),
      powerCharging: Boolean(value.powerCharging),
      enemies: Array.isArray(value.enemies) ? value.enemies : [],
      playerStart: Math.max(0, Math.min(84, Math.round(Number(value.playerStart ?? 42)))),
      displayMode: value.displayMode === "fov" ? "fov" : "target",
      outlineEffectMode: ["none", "reverse"].includes(value.outlineEffectMode) ? value.outlineEffectMode : "same",
      inputForces: {
        left: Math.max(0, Math.round(Number(value.inputForces?.left ?? 0))),
        right: Math.max(0, Math.round(Number(value.inputForces?.right ?? 0))),
      },
      gameStarting: Boolean(value.gameStarting),
      autoEndsAt: Math.max(0, Math.round(Number(value.autoEndsAt ?? 0))),
      running: Boolean(value.running),
      gameOver: Boolean(value.gameOver),
      gameOverStartedAt: Math.max(0, Math.round(Number(value.gameOverStartedAt ?? 0))),
      gameOverEnemyBlinkOn: Boolean(value.gameOverEnemyBlinkOn),
      gameOverLedState: value.gameOverLedState === "level10" || value.gameOverLedState === "off" ? value.gameOverLedState : null,
    }),
  });

  const BIKE_TEMPLATE = Object.freeze({
    width: 62,
    bounds: { minX: -17, minY: -28, maxX: 79, maxY: 39 },
    wheelRadius: 17,
    dotSpacing: 4.3,
    scale: 0.84,
  });

  const canvas = document.getElementById("led-canvas");
  const speakerDialog = document.getElementById("speaker-dialog");
  const speakerLeftButton = document.getElementById("speaker-left");
  const speakerStereoButton = document.getElementById("speaker-stereo");
  const speakerRightButton = document.getElementById("speaker-right");
  const ctx = canvas.getContext("2d", { alpha: false, desynchronized: true });
  const dotSpriteCache = new Map();

  if (!ctx) {
    return;
  }

  class DisplayAudio {
    constructor() {
      this.context = null;
      this.masterGain = null;
      this.chargeNodes = null;
      this.enemyTickTimer = null;
      this.enemyDistance = null;
      this.enemySpatial = null;
      this.enemyTickEnemyId = null;
      this.enemyTickActive = false;
      this.speakerRole = null;
    }

    ensureContext() {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) {
        return null;
      }

      if (!this.context) {
        this.context = new AudioContextClass();
        this.masterGain = this.context.createGain();
        this.masterGain.gain.value = AUDIO.masterVolume;
        this.masterGain.connect(this.context.destination);
      }

      if (this.context.state === "suspended") {
        this.context.resume().catch(() => {});
      }

      return this.context;
    }

    unlock() {
      const context = this.ensureContext();
      if (!context) {
        return;
      }

      const tick = context.createOscillator();
      const gain = context.createGain();
      gain.gain.value = 0.0001;
      tick.frequency.value = 40;
      tick.connect(gain);
      gain.connect(this.masterGain);
      tick.start();
      tick.stop(context.currentTime + 0.02);
    }

    setSpeakerRole(role) {
      this.speakerRole = ["left", "right", "stereo"].includes(role) ? role : "stereo";
      this.unlock();
    }

    setCharging(charging) {
      if (charging) {
        this.startCharging();
        return;
      }
      this.stopCharging();
    }

    startCharging() {
      if (this.chargeNodes) {
        return;
      }

      const context = this.ensureContext();
      if (!context) {
        return;
      }

      const output = context.createGain();
      const filter = context.createBiquadFilter();
      const bass = context.createOscillator();
      const buzz = context.createOscillator();
      const lfo = context.createOscillator();
      const lfoGain = context.createGain();
      const noise = context.createBufferSource();
      const noiseGain = context.createGain();

      output.gain.setValueAtTime(0.0001, context.currentTime);
      output.gain.exponentialRampToValueAtTime(AUDIO.chargeVolume, context.currentTime + AUDIO.chargeFadeMs / 1000);
      filter.type = "bandpass";
      filter.frequency.value = 720;
      filter.Q.value = 1.7;
      bass.type = "sawtooth";
      bass.frequency.value = 82;
      buzz.type = "square";
      buzz.frequency.value = 164;
      lfo.type = "sine";
      lfo.frequency.value = 11;
      lfoGain.gain.value = 34;
      noiseGain.gain.value = 0.028;

      const buffer = context.createBuffer(1, context.sampleRate, context.sampleRate);
      const samples = buffer.getChannelData(0);
      for (let i = 0; i < samples.length; i += 1) {
        samples[i] = Math.random() * 2 - 1;
      }
      noise.buffer = buffer;
      noise.loop = true;

      lfo.connect(lfoGain);
      lfoGain.connect(filter.frequency);
      bass.connect(filter);
      buzz.connect(filter);
      noise.connect(noiseGain);
      noiseGain.connect(filter);
      filter.connect(output);
      output.connect(this.masterGain);

      bass.start();
      buzz.start();
      lfo.start();
      noise.start();
      this.chargeNodes = { bass, buzz, lfo, noise, output };
    }

    stopCharging() {
      if (!this.chargeNodes || !this.context) {
        return;
      }

      const { bass, buzz, lfo, noise, output } = this.chargeNodes;
      const stopAt = this.context.currentTime + AUDIO.chargeFadeMs / 1000;
      output.gain.cancelScheduledValues(this.context.currentTime);
      output.gain.setValueAtTime(Math.max(0.0001, output.gain.value), this.context.currentTime);
      output.gain.exponentialRampToValueAtTime(0.0001, stopAt);
      for (const source of [bass, buzz, lfo, noise]) {
        source.stop(stopAt + 0.02);
      }
      this.chargeNodes = null;
    }

    playShoot() {
      const context = this.ensureContext();
      if (!context) {
        return;
      }

      const now = context.currentTime;
      const boom = context.createOscillator();
      const boomGain = context.createGain();
      const noise = context.createBufferSource();
      const noiseFilter = context.createBiquadFilter();
      const noiseGain = context.createGain();

      boom.type = "sine";
      boom.frequency.setValueAtTime(118, now);
      boom.frequency.exponentialRampToValueAtTime(36, now + 0.34);
      boomGain.gain.setValueAtTime(AUDIO.shootVolume, now);
      boomGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.42);

      const buffer = context.createBuffer(1, Math.floor(context.sampleRate * 0.38), context.sampleRate);
      const samples = buffer.getChannelData(0);
      for (let i = 0; i < samples.length; i += 1) {
        const decay = 1 - i / samples.length;
        samples[i] = (Math.random() * 2 - 1) * decay;
      }
      noise.buffer = buffer;
      noiseFilter.type = "lowpass";
      noiseFilter.frequency.setValueAtTime(1500, now);
      noiseFilter.frequency.exponentialRampToValueAtTime(180, now + 0.3);
      noiseGain.gain.setValueAtTime(AUDIO.shootVolume * 0.65, now);
      noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.34);

      boom.connect(boomGain);
      boomGain.connect(this.masterGain);
      noise.connect(noiseFilter);
      noiseFilter.connect(noiseGain);
      noiseGain.connect(this.masterGain);
      boom.start(now);
      boom.stop(now + 0.45);
      noise.start(now);
      noise.stop(now + 0.4);
    }

    updateEnemyTick(enemy) {
      const previousDistance = this.enemyDistance;
      const previousEnemyId = this.enemyTickEnemyId;
      const nextDistance = Number.isFinite(Number(enemy?.distance)) ? Number(enemy.distance) : null;
      const nextSpatial = enemy?.spatial ?? null;
      const nextEnemyId = enemy?.id ?? null;
      this.enemyDistance = nextDistance;
      this.enemySpatial = nextSpatial;
      this.enemyTickEnemyId = nextEnemyId;
      const shouldTick = nextDistance !== null;
      if (shouldTick === this.enemyTickActive) {
        if (shouldTick && (nextDistance !== previousDistance || nextEnemyId !== previousEnemyId)) {
          this.scheduleEnemyTick(Math.min(this.enemyTickDelay(), AUDIO.enemyTickMinMs));
        }
        return;
      }

      this.enemyTickActive = shouldTick;
      if (shouldTick) {
        this.scheduleEnemyTick(0);
        return;
      }
      if (this.enemyTickTimer) {
        window.clearTimeout(this.enemyTickTimer);
        this.enemyTickTimer = null;
      }
    }

    enemyTickDelay() {
      const maxDistance = STATE_TOOLS.GAME.maxDistance ?? 10;
      const distance = Math.max(1, Math.min(maxDistance, this.enemyDistance ?? maxDistance));
      const danger = 1 - (distance - 1) / Math.max(1, maxDistance - 1);
      const curve = danger * danger;
      return AUDIO.enemyTickMaxMs - (AUDIO.enemyTickMaxMs - AUDIO.enemyTickMinMs) * curve;
    }

    scheduleEnemyTick(delay = this.enemyTickDelay()) {
      if (this.enemyTickTimer) {
        window.clearTimeout(this.enemyTickTimer);
      }

      this.enemyTickTimer = window.setTimeout(() => {
        this.enemyTickTimer = null;
        if (!this.enemyTickActive || this.enemyDistance === null) {
          return;
        }
        this.playEnemyTick();
        this.scheduleEnemyTick();
      }, delay);
    }

    playEnemyTick() {
      const context = this.ensureContext();
      if (!context || !this.speakerRole) {
        return;
      }

      const maxDistance = STATE_TOOLS.GAME.maxDistance ?? 10;
      const distance = Math.max(1, Math.min(maxDistance, this.enemyDistance ?? maxDistance));
      const danger = 1 - (distance - 1) / Math.max(1, maxDistance - 1);
      const now = context.currentTime;
      const osc = context.createOscillator();
      const gain = context.createGain();
      const filter = context.createBiquadFilter();
      const panner = context.createStereoPanner?.();

      osc.type = "square";
      osc.frequency.value = 620 + danger * 1120;
      filter.type = "highpass";
      filter.frequency.value = 520;
      gain.gain.setValueAtTime(AUDIO.enemyTickVolume * (0.45 + danger * 0.65) * this.enemySpeakerGain(), now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.055);
      if (panner && this.speakerRole === "stereo") {
        panner.pan.value = this.enemyPan();
      }

      osc.connect(filter);
      if (panner && this.speakerRole === "stereo") {
        filter.connect(panner);
        panner.connect(gain);
      } else {
        filter.connect(gain);
      }
      gain.connect(this.masterGain);
      osc.start(now);
      osc.stop(now + 0.065);
    }

    enemySpeakerGain() {
      if (this.speakerRole === "stereo") {
        return this.enemyDistanceGain();
      }

      const spatial = this.enemySpatial;
      if (!spatial) {
        return 1;
      }

      const pan = this.enemyPan();
      const sourceSide = this.speakerRole === "left" ? -1 : 1;
      const sourceDistance = Math.abs(pan - sourceSide) / 2;
      const sideGain = Math.pow(1 - Math.max(0, Math.min(1, sourceDistance)), AUDIO.enemyTickPanPower);
      return Math.max(AUDIO.enemyTickMinSpeakerGain, sideGain * this.enemyDistanceGain());
    }

    enemyPan() {
      const spatial = this.enemySpatial;
      if (!spatial) {
        return 0;
      }

      return Math.max(-1, Math.min(1, spatial.relativeToPlayer / AUDIO.enemyTickPanWidth));
    }

    enemyDistanceGain() {
      const spatial = this.enemySpatial;
      if (!spatial) {
        return 1;
      }

      const fieldHalf = Math.max(1, (STATE_TOOLS.GAME.playfieldSlots ?? 88) / 2);
      const distance = Math.min(fieldHalf, Math.abs(spatial.relativeToPlayer));
      return 1 - AUDIO.enemyTickStereoDistanceDrop * (distance / fieldHalf);
    }

    playGameOverTune() {
      const context = this.ensureContext();
      if (!context) {
        return;
      }

      const now = context.currentTime;
      const notes = [
        { at: 0, frequency: 392, duration: 0.18 },
        { at: 0.2, frequency: 330, duration: 0.2 },
        { at: 0.43, frequency: 262, duration: 0.28 },
        { at: 0.78, frequency: 196, duration: 0.5 },
      ];

      notes.forEach((note, index) => {
        const start = now + note.at;
        const end = start + note.duration;
        const osc = context.createOscillator();
        const gain = context.createGain();
        const filter = context.createBiquadFilter();

        osc.type = index === notes.length - 1 ? "sawtooth" : "triangle";
        osc.frequency.setValueAtTime(note.frequency, start);
        osc.frequency.exponentialRampToValueAtTime(note.frequency * 0.82, end);
        filter.type = "lowpass";
        filter.frequency.setValueAtTime(1400, start);
        filter.frequency.exponentialRampToValueAtTime(360, end);
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(AUDIO.gameOverVolume, start + 0.025);
        gain.gain.exponentialRampToValueAtTime(0.0001, end);

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(this.masterGain);
        osc.start(start);
        osc.stop(end + 0.03);
      });

      const thump = context.createOscillator();
      const thumpGain = context.createGain();
      thump.type = "sine";
      thump.frequency.setValueAtTime(82, now + 0.78);
      thump.frequency.exponentialRampToValueAtTime(34, now + 1.22);
      thumpGain.gain.setValueAtTime(AUDIO.gameOverVolume * 0.85, now + 0.78);
      thumpGain.gain.exponentialRampToValueAtTime(0.0001, now + 1.25);
      thump.connect(thumpGain);
      thumpGain.connect(this.masterGain);
      thump.start(now + 0.78);
      thump.stop(now + 1.28);
    }

    playGameStartTune() {
      const context = this.ensureContext();
      if (!context) {
        return;
      }

      const now = context.currentTime;
      const noteMs = (STATE_TOOLS.GAME.gameStartNoteMs ?? 700) / 1000;
      const notes = [
        { at: 0, frequency: 440 },
        { at: noteMs, frequency: 554 },
        { at: noteMs * 2, frequency: 659 },
      ];

      notes.forEach((note, index) => {
        const start = now + note.at;
        const end = start + Math.min(0.62, noteMs * 0.68);
        const osc = context.createOscillator();
        const gain = context.createGain();
        const filter = context.createBiquadFilter();

        osc.type = "square";
        osc.frequency.setValueAtTime(note.frequency, start);
        osc.frequency.exponentialRampToValueAtTime(note.frequency * 1.08, end);
        filter.type = "bandpass";
        filter.frequency.value = note.frequency * 2.2;
        filter.Q.value = 5.5;
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(AUDIO.gameStartVolume * (index === 2 ? 1.25 : 1), start + 0.018);
        gain.gain.exponentialRampToValueAtTime(0.0001, end);

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(this.masterGain);
        osc.start(start);
        osc.stop(end + 0.025);
      });
    }

    update(nextState, previousState, shotFired) {
      this.setCharging(Boolean(nextState.powerCharging) && !nextState.gameOver);
      if (!previousState.gameStarting && nextState.gameStarting) {
        this.playGameStartTune();
      }
      if (shotFired && !nextState.gameOver) {
        this.playShoot();
      }
      this.updateEnemyTick(priorityTickEnemy(nextState));
      if (previousState.gameOver !== nextState.gameOver && nextState.gameOver) {
        this.stopCharging();
        this.updateEnemyTick(null);
        this.playGameOverTune();
      }
    }
  }

  class LedDot {
    constructor(x, y, options = {}) {
      this.x = x;
      this.y = y;
      this.radius = options.radius ?? 2.15;
      this.color = options.color ?? COLORS.blue;
      this.state = options.state ?? "level4";
      this.glowColor = options.glowColor ?? this.color;
      this.phase = options.phase ?? 0;
    }

    draw(context, pulse, stateOverride = null) {
      const sprite = dotSprite(this, stateOverride ?? this.state);
      if (!sprite) {
        return;
      }

      context.globalCompositeOperation = "lighter";
      context.drawImage(sprite.canvas, this.x - sprite.center, this.y - sprite.center);
    }
  }

  class DotCollection {
    constructor(dots = []) {
      this.dots = dots;
    }

    add(dots) {
      this.dots.push(...dots);
      return this;
    }

    draw(context, pulse, stateOverride = null) {
      for (const dot of this.dots) {
        dot.draw(context, pulse, stateOverride);
      }
    }
  }

  class LedGraphic extends DotCollection {
    constructor(dots = [], options = {}) {
      super(dots);
      this.name = options.name ?? "graphic";
      this.state = options.state ?? null;
    }

    draw(context, pulse, stateOverride = null) {
      for (const dot of this.dots) {
        dot.draw(context, pulse, stateOverride ?? this.state);
      }
    }
  }

  class SolidStrokeGraphic {
    constructor(paths = [], options = {}) {
      this.paths = paths;
      this.color = options.color ?? COLORS.blue;
      this.glowColor = options.glowColor ?? this.color;
      this.lineWidth = options.lineWidth ?? 6;
      this.state = options.state ?? "level5";
      this.name = options.name ?? "solid-graphic";
    }

    draw(context, pulse, stateOverride = null) {
      const state = STATES[stateOverride ?? this.state] ?? STATES.level4;
      const shimmer = 0.94 + Math.sin(pulse) * 0.06;
      const alpha = state.alpha * shimmer;
      const glow = state.glow * shimmer;

      context.save();
      context.globalCompositeOperation = "lighter";
      context.lineCap = "round";
      context.lineJoin = "round";
      context.strokeStyle = this.glowColor;
      context.lineWidth = this.lineWidth * 1.35;
      context.globalAlpha = alpha * 0.26;
      context.shadowColor = this.glowColor;
      context.shadowBlur = this.lineWidth * 4.8 * glow;
      drawStrokePaths(context, this.paths);

      context.strokeStyle = this.color;
      context.lineWidth = this.lineWidth;
      context.globalAlpha = alpha;
      context.shadowBlur = this.lineWidth * 1.6 * glow;
      drawStrokePaths(context, this.paths);
      context.restore();
    }
  }

  class LedScene {
    constructor(options = {}) {
      this.layers = [];
      this.stateOverride = options.stateOverride ?? null;
    }

    add(layer) {
      this.layers.push(layer);
      return layer;
    }

    draw(context, pulse) {
      drawBackground(context);
      for (const layer of this.layers) {
        layer.draw(context, pulse, this.stateOverride);
      }
    }
  }

  function dot(x, y, options) {
    return new LedDot(x, y, options);
  }

  function dotSprite(source, stateName) {
    const state = STATES[stateName] ?? STATES.level4;
    if (state.alpha <= 0) {
      return null;
    }

    const key = [
      source.radius.toFixed(3),
      source.color,
      source.glowColor,
      stateName,
    ].join("|");
    const cached = dotSpriteCache.get(key);
    if (cached) {
      return cached;
    }

    const radius = source.radius;
    const center = Math.ceil(radius * (8 + state.glow * 2));
    const size = center * 2;
    const spriteCanvas = createRenderCanvas(size, size);
    const spriteContext = spriteCanvas.getContext("2d");
    const alpha = state.alpha;
    const glow = state.glow;

    spriteContext.globalCompositeOperation = "lighter";
    spriteContext.globalAlpha = alpha * 0.32;
    spriteContext.fillStyle = source.glowColor;
    spriteContext.shadowColor = source.glowColor;
    spriteContext.shadowBlur = radius * 5.8 * glow;
    spriteContext.beginPath();
    spriteContext.arc(center, center, radius * 1.35, 0, Math.PI * 2);
    spriteContext.fill();

    spriteContext.globalAlpha = alpha;
    spriteContext.shadowBlur = radius * 2.6 * glow;
    spriteContext.fillStyle = source.color;
    spriteContext.beginPath();
    spriteContext.arc(center, center, radius, 0, Math.PI * 2);
    spriteContext.fill();

    spriteContext.globalAlpha = Math.min(1, alpha * 0.72);
    spriteContext.shadowBlur = 0;
    spriteContext.fillStyle = "#ffffff";
    spriteContext.beginPath();
    spriteContext.arc(center - radius * 0.22, center - radius * 0.24, radius * 0.28, 0, Math.PI * 2);
    spriteContext.fill();

    const sprite = { canvas: spriteCanvas, center };
    dotSpriteCache.set(key, sprite);
    return sprite;
  }

  function drawStrokePaths(context, paths) {
    for (const path of paths) {
      context.beginPath();
      if (path.type === "polyline") {
        context.moveTo(path.points[0].x, path.points[0].y);
        for (let i = 1; i < path.points.length; i += 1) {
          context.lineTo(path.points[i].x, path.points[i].y);
        }
      } else if (path.type === "arc") {
        context.arc(path.center.x, path.center.y, path.radius, path.startAngle, path.endAngle);
      }
      context.stroke();
    }
  }

  function circleArcPathsOutsideHorizontalBand(center, radius, clearance) {
    const safeClearance = Math.max(0, Math.min(clearance, radius - 1));
    const cutAngle = Math.asin(safeClearance / radius);

    return [
      {
        type: "arc",
        center,
        radius,
        startAngle: Math.PI + cutAngle,
        endAngle: Math.PI * 2 - cutAngle,
      },
      {
        type: "arc",
        center,
        radius,
        startAngle: cutAngle,
        endAngle: Math.PI - cutAngle,
      },
    ];
  }

  function cloneDot(source, x, y, overrides = {}) {
    return dot(x, y, {
      radius: source.radius,
      color: source.color,
      state: source.state,
      glowColor: source.glowColor,
      phase: source.phase,
      ...overrides,
    });
  }

  function dotsOnLine(start, end, spacing, options = {}) {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const length = Math.hypot(dx, dy);
    const steps = Math.max(1, Math.round(length / spacing));
    const result = [];

    for (let i = 0; i <= steps; i += 1) {
      const t = i / steps;
      result.push(dot(start.x + dx * t, start.y + dy * t, { ...options, phase: options.phase ?? t * Math.PI }));
    }

    return result;
  }

  function dotsOnPolyline(points, spacing, options = {}) {
    const result = [];
    for (let i = 0; i < points.length - 1; i += 1) {
      const segment = dotsOnLine(points[i], points[i + 1], spacing, options);
      if (i > 0) segment.shift();
      result.push(...segment);
    }
    return result;
  }

  function dotsOnClosedPolyline(points, spacing, options = {}) {
    const segments = points.map((start, index) => {
      const end = points[(index + 1) % points.length];
      return {
        start,
        end,
        length: Math.hypot(end.x - start.x, end.y - start.y),
      };
    });
    const perimeter = segments.reduce((total, segment) => total + segment.length, 0);
    const count = Math.max(3, Math.round(perimeter / spacing));
    const result = [];

    for (let i = 0; i < count; i += 1) {
      let distance = (i / count) * perimeter;
      const segment = segments.find((candidate) => {
        if (distance <= candidate.length) return true;
        distance -= candidate.length;
        return false;
      }) ?? segments[segments.length - 1];
      const t = segment.length === 0 ? 0 : distance / segment.length;
      result.push(dot(
        segment.start.x + (segment.end.x - segment.start.x) * t,
        segment.start.y + (segment.end.y - segment.start.y) * t,
        { ...options, phase: options.phase ?? i * 0.08 }
      ));
    }

    return result;
  }

  function dotsOnCircle(center, radius, spacing, options = {}) {
    const circumference = Math.PI * 2 * radius;
    const count = Math.max(8, Math.round(circumference / spacing));
    const result = [];

    for (let i = 0; i < count; i += 1) {
      const angle = (i / count) * Math.PI * 2;
      result.push(dot(center.x + Math.cos(angle) * radius, center.y + Math.sin(angle) * radius, {
        ...options,
        phase: options.phase ?? angle,
      }));
    }

    return result;
  }

  function dotsOnCircleOutsideHorizontalBand(center, radius, spacing, clearance, options = {}) {
    return dotsOnCircle(center, radius, spacing, options).filter((item) => (
      Math.abs(item.y - center.y) > clearance
    ));
  }

  function targetArcDots(center, radius, spacing, clearance, options = {}) {
    const items = dotsOnCircle(center, radius, spacing, options)
      .map((item) => ({
        dot: item,
        angle: Math.atan2(item.y - center.y, item.x - center.x),
      }))
      .filter(({ dot: item }) => Math.abs(item.y - center.y) > clearance)
      .map(({ dot: item, angle }) => {
        const upper = item.y < center.y;
        const arcCenterAngle = upper ? -Math.PI / 2 : Math.PI / 2;
        const distanceFromArcCenter = Math.abs(shortestAngleDistance(angle, arcCenterAngle));
        return { dot: item, upper, distanceFromArcCenter };
      });

    for (const upper of [true, false]) {
      const arcItems = items
        .filter((item) => item.upper === upper)
        .sort((left, right) => left.distanceFromArcCenter - right.distanceFromArcCenter);
      let rank = -1;
      let previousDistance = null;
      for (const item of arcItems) {
        const distanceKey = item.distanceFromArcCenter.toFixed(6);
        if (distanceKey !== previousDistance) {
          rank += 1;
          previousDistance = distanceKey;
        }
        item.revealRank = rank;
      }
    }

    return items;
  }

  function shortestAngleDistance(angle, targetAngle) {
    return Math.atan2(Math.sin(angle - targetAngle), Math.cos(angle - targetAngle));
  }

  function dotsOnArc(center, radius, startAngle, endAngle, spacing, options = {}) {
    const sweep = endAngle - startAngle;
    const count = Math.max(2, Math.round(Math.abs(sweep * radius) / spacing));
    const result = [];

    for (let i = 0; i <= count; i += 1) {
      const t = i / count;
      const angle = startAngle + sweep * t;
      result.push(dot(center.x + Math.cos(angle) * radius, center.y + Math.sin(angle) * radius, {
        ...options,
        phase: options.phase ?? angle,
      }));
    }

    return result;
  }

  function chamferedRectDots(rect, chamfer, spacing, options = {}) {
    const { x, y, width, height } = rect;
    const points = [
      { x: x + chamfer, y },
      { x: x + width - chamfer, y },
      { x: x + width, y: y + chamfer },
      { x: x + width, y: y + height - chamfer },
      { x: x + width - chamfer, y: y + height },
      { x: x + chamfer, y: y + height },
      { x, y: y + height - chamfer },
      { x, y: y + chamfer },
    ];
    return dotsOnClosedPolyline(points, spacing, options);
  }

  function chamferedRectHalfPaths(rect, chamfer) {
    const { x, y, width, height } = rect;
    const leftMid = { x, y: y + height / 2 };
    const rightMid = { x: x + width, y: y + height / 2 };
    return [
      [
        leftMid,
        { x, y: y + chamfer },
        { x: x + chamfer, y },
        { x: x + width - chamfer, y },
        { x: x + width, y: y + chamfer },
        rightMid,
      ],
      [
        leftMid,
        { x, y: y + height - chamfer },
        { x: x + chamfer, y: y + height },
        { x: x + width - chamfer, y: y + height },
        { x: x + width, y: y + height - chamfer },
        rightMid,
      ],
    ];
  }

  function outlineHalfDots(options = {}) {
    return chamferedRectHalfPaths(LAYOUT.panel, LAYOUT.panel.chamfer)
      .map((points) => dotsOnPolyline(points, OUTLINE_DOT_SPACING, options));
  }

  const OUTLINE_HALF_DOTS = outlineHalfDots({
    color: COLORS.blue,
    glowColor: COLORS.blue,
    radius: 1.85,
    state: "level5",
  });

  function isOutlineMotionActive() {
    return Boolean(outlineMotion && performance.now() < outlineMotion.activeUntil);
  }

  function isGameStartOutlineBlinking() {
    return performance.now() < gameStartOutlineBlinkUntil;
  }

  function wrapUnit(value) {
    return ((value % 1) + 1) % 1;
  }

  function updateOutlineFlow(now = performance.now()) {
    if (!outlineMotion) {
      outlineMotion = {
        activeUntil: 0,
        direction: -1,
        lastFrameAt: now,
        offset: 0,
        velocity: 0,
      };
      return;
    }

    const activeUntil = Math.min(now, outlineMotion.activeUntil);
    const elapsed = Math.max(0, activeUntil - outlineMotion.lastFrameAt);
    if (elapsed > 0) {
      outlineMotion.offset = wrapUnit(outlineMotion.offset + elapsed * outlineMotion.velocity);
    }
    outlineMotion.lastFrameAt = now;
  }

  function setOutlineFlowDirection(direction, now = performance.now()) {
    updateOutlineFlow(now);
    if (outlineMotion.direction === direction) {
      return;
    }

    outlineMotion.offset = wrapUnit(1 - outlineMotion.offset);
    outlineMotion.direction = direction;
  }

  function outlineWaveState(dotIndex, dotCount) {
    if (!outlineMotion || dotCount <= 1) {
      return null;
    }

    if (!isOutlineMotionActive()) {
      return null;
    }

    const finalIndex = Math.max(1, dotCount - 1);
    const position = outlineMotion.direction > 0
      ? dotIndex / finalIndex
      : (finalIndex - dotIndex) / finalIndex;
    const span = OUTLINE_WAVELET_DOTS / finalIndex;

    for (let wave = 0; wave < OUTLINE_WAVE_COUNT; wave += 1) {
      const head = wrapUnit(outlineMotion.offset + wave / OUTLINE_WAVE_COUNT);
      const lag = wrapUnit(head - position);
      if (lag < span) {
        const levelIndex = Math.min(OUTLINE_WAVELET_STATES.length - 1, Math.floor(lag * finalIndex));
        return OUTLINE_WAVELET_STATES[levelIndex];
      }
    }

    return null;
  }

  function shouldUseStandbyOutline() {
    return false;
  }

  function standbyOutlineWaveState(dotIndex, dotCount) {
    if (!shouldUseStandbyOutline() || dotCount <= 1) {
      return null;
    }

    const progress = (performance.now() % STANDBY_OUTLINE_CYCLE_MS) / STANDBY_OUTLINE_CYCLE_MS;
    const normalizedIndex = dotIndex / dotCount;
    const tailSpan = OUTLINE_WAVELET_STATES.length / dotCount;

    for (let wave = 0; wave < STANDBY_OUTLINE_WAVE_COUNT; wave += 1) {
      const head = (progress + wave * STANDBY_OUTLINE_WAVE_SPACING) % 1;
      const lag = (normalizedIndex - head + 1) % 1;
      if (lag <= tailSpan) {
        const levelIndex = Math.min(OUTLINE_WAVELET_STATES.length - 1, Math.floor(lag * dotCount));
        return OUTLINE_WAVELET_STATES[levelIndex];
      }
    }

    return null;
  }

  function createStandbyOutlineDots() {
    const dots = [];
    for (const halfDots of OUTLINE_HALF_DOTS) {
      halfDots.forEach((source, dotIndex) => {
        const waveState = standbyOutlineWaveState(dotIndex, halfDots.length);
        dots.push(cloneDot(source, source.x, source.y, {
          color: waveState ? COLORS.blue : COLORS.laneOff,
          glowColor: waveState ? COLORS.blue : COLORS.laneOff,
          radius: waveState ? source.radius * 1.32 : source.radius,
          state: waveState ?? "level2",
          phase: source.phase,
        }));
      });
    }

    return new DotCollection(dots);
  }

  function createOutlineDots() {
    if (shouldUseStandbyOutline()) {
      return createStandbyOutlineDots();
    }

    updateOutlineFlow();
    const startBlink = isGameStartOutlineBlinking();
    const startSequence = displayState.gameStarting;
    const moving = isOutlineMotionActive();
    const outlineInactive = displayState.outlineEffectMode === STATE_TOOLS.OUTLINE_EFFECT_MODES.NONE;
    const idle = !moving || outlineInactive;
    const dots = [];
    for (let halfIndex = 0; halfIndex < OUTLINE_HALF_DOTS.length; halfIndex += 1) {
      const halfDots = OUTLINE_HALF_DOTS[halfIndex];
      for (let dotIndex = 0; dotIndex < halfDots.length; dotIndex += 1) {
        if (halfIndex > 0 && (dotIndex === 0 || dotIndex === halfDots.length - 1)) {
          continue;
        }

        const source = halfDots[dotIndex];
        const waveState = outlineWaveState(dotIndex, halfDots.length);
        const startColor = startBlink ? COLORS.blue : COLORS.laneOff;
        dots.push(cloneDot(source, source.x, source.y, {
          color: startSequence ? startColor : (waveState || idle ? COLORS.blue : COLORS.laneOff),
          glowColor: startSequence ? startColor : (waveState || idle ? COLORS.blue : COLORS.laneOff),
          radius: waveState ? source.radius * 1.32 : source.radius,
          state: startSequence ? (startBlink ? OUTLINE_IDLE_WAVE_STATE : "level2") : (waveState ?? (idle ? OUTLINE_IDLE_WAVE_STATE : "level2")),
          phase: source.phase,
        }));
      }
    }

    return new DotCollection(dots);
  }

  function transformDots(factory, transform) {
    const { center, origin, scale = 1, mirrored = false } = transform;
    return factory().map((item) => {
      const localX = mirrored ? origin.x - (item.x - origin.x) : item.x;
      const localY = item.y;
      return cloneDot(
        item,
        center.x + (localX - origin.x) * scale,
        center.y + (localY - origin.y) * scale,
        { radius: item.radius * scale }
      );
    });
  }

  function forceState(force) {
    if (force <= 0) {
      return "level1";
    }
    return `level${Math.max(5, Math.min(10, force + 4))}`;
  }

  function forceGraphicStyle(force, activeColor, activeGlowColor = activeColor) {
    if (force <= 0) {
      return {
        color: COLORS.laneOff,
        glowColor: COLORS.laneOff,
        state: "level2",
      };
    }

    return {
      color: activeColor,
      glowColor: activeGlowColor,
      state: forceState(force),
    };
  }

  function createArrowGraphic(origin, direction = 1, style = forceGraphicStyle(0, COLORS.blue)) {
    const arm = 22;
    const halfHeight = 24;
    const points = [
      { x: origin.x - direction * arm, y: origin.y - halfHeight },
      { x: origin.x, y: origin.y },
      { x: origin.x - direction * arm, y: origin.y + halfHeight },
    ];
    return new SolidStrokeGraphic([{ type: "polyline", points }], {
      color: style.color,
      glowColor: style.glowColor,
      lineWidth: 6,
      state: style.state,
      name: "arrow",
    });
  }

  function bikeTemplateDots(style = forceGraphicStyle(1, COLORS.cyanBlue, COLORS.blue)) {
    const bikeLed = { color: style.color, glowColor: style.glowColor, radius: 1.85, state: "level5" };
    const { width, wheelRadius, dotSpacing } = BIKE_TEMPLATE;
    const dots = [];
    dots.push(...dotsOnCircle({ x: 0, y: 22 }, wheelRadius, 4.2, bikeLed));
    dots.push(...dotsOnCircle({ x: width, y: 22 }, wheelRadius, 4.2, bikeLed));
    dots.push(...dotsOnPolyline([
      { x: 0, y: 22 },
      { x: 25, y: -4 },
      { x: 43, y: 22 },
      { x: 0, y: 22 },
      { x: 22, y: 22 },
      { x: 36, y: -4 },
      { x: 25, y: -4 },
    ], dotSpacing, bikeLed));
    dots.push(...dotsOnPolyline([
      { x: 36, y: -4 },
      { x: 55, y: -4 },
      { x: width, y: 22 },
    ], dotSpacing, bikeLed));
    dots.push(...dotsOnPolyline([
      { x: 25, y: -4 },
      { x: 20, y: -20 },
      { x: 10, y: -20 },
    ], 4.5, bikeLed));
    dots.push(...dotsOnPolyline([
      { x: 55, y: -4 },
      { x: 54, y: -22 },
      { x: 43, y: -22 },
    ], 4.5, bikeLed));
    dots.push(...dotsOnLine({ x: 11, y: -26 }, { x: 25, y: -26 }, 4.5, bikeLed));
    dots.push(...dotsOnLine({ x: 44, y: -28 }, { x: 57, y: -28 }, 4.5, bikeLed));
    return dots;
  }

  function createBikeGraphic(center, mirrored = false, style = forceGraphicStyle(0, COLORS.cyanBlue, COLORS.blue)) {
    const baseFactory = () => bikeTemplateDots(style);
    const { bounds, scale } = BIKE_TEMPLATE;
    const origin = {
      x: (bounds.minX + bounds.maxX) / 2,
      y: (bounds.minY + bounds.maxY) / 2,
    };
    const dots = transformDots(baseFactory, { center, origin, scale, mirrored });
    return new LedGraphic(dots, { name: "bicycle", state: style.state });
  }

  function createTargetGraphic(center, options = {}) {
    const {
      outerRadius,
      outerSpacing,
      outerDotRadius,
      outerLaneClearance,
      innerRadius,
      innerLineWidth,
      innerLaneClearance,
    } = LAYOUT.target;
    const outerState = options.outerState ?? "level5";
    const includeOuter = options.includeOuter ?? true;
    const includeInner = options.includeInner ?? true;
    const forceFullOuter = Boolean(options.forceFullOuter);
    const redOn = { color: COLORS.red, glowColor: COLORS.red, radius: outerDotRadius, state: outerState };
    const layers = [];

    if (includeOuter) {
      const arcDots = targetArcDots(center, outerRadius, outerSpacing, outerLaneClearance, redOn);
      const maxRevealRank = Math.max(...arcDots.map((item) => item.revealRank ?? 0), 0);
      const revealRank = targetArcRevealRank(forceFullOuter, maxRevealRank);
      layers.push(...arcDots.map((item) => {
        const visible = item.revealRank <= revealRank;
        return cloneDot(item.dot, item.dot.x, item.dot.y, {
          state: visible ? outerState : "off",
        });
      }));
    }

    if (includeInner) {
      const innerPaths = circleArcPathsOutsideHorizontalBand(center, innerRadius, innerLaneClearance);
      layers.push(new SolidStrokeGraphic(innerPaths, {
        color: COLORS.red,
        glowColor: COLORS.red,
        lineWidth: innerLineWidth,
        state: "level5",
        name: "target-inner",
      }));
    }

    return new DotCollection(layers);
  }

  function targetArcRevealRank(forceFullOuter, maxRevealRank) {
    if (forceFullOuter || !displayState.running || displayState.gameOver) {
      return Infinity;
    }

    const revealSteps = maxRevealRank + 1;
    const cyclePosition = (performance.now() % TARGET_ARC_CYCLE_MS) / TARGET_ARC_CYCLE_MS;
    const growProgress = cyclePosition < 0.5 ? cyclePosition * 2 : (1 - cyclePosition) * 2;
    return Math.max(-1, Math.min(maxRevealRank, Math.floor(growProgress * (revealSteps + 1)) - 1));
  }

  function isTargetShootBlinking() {
    return Date.now() < targetShootBlinkUntil;
  }

  function targetOuterShouldUseFullForm(displayState) {
    return (!displayState.gameOver && enemyOverlapsPlayer(displayState)) || isTargetShootBlinking();
  }

  function laneSlotXs() {
    const { inset, spacing, exclusions } = LAYOUT.lane;
    const startX = inset;
    const endX = STAGE.width - inset;
    const length = endX - startX;
    const steps = Math.max(1, Math.round(length / spacing));
    const slots = [];

    for (let index = 0; index <= steps; index += 1) {
      const x = startX + (index / steps) * length;
      if (!exclusions.some((range) => Math.abs(x - range.centerX) <= range.radius)) {
        slots.push(x);
      }
    }

    return slots;
  }

  const LANE_SLOT_XS = laneSlotXs();

  function displaySlotForField(fieldSlot) {
    return fieldSlot + STATE_TOOLS.GAME.displayPadding;
  }

  function centerStartDisplaySlot() {
    return Math.floor((STATE_TOOLS.GAME.displaySlots - STATE_TOOLS.GAME.playerWidth) / 2);
  }

  function slotCenterX(slot) {
    const minSlot = 0;
    const maxSlot = LANE_SLOT_XS.length - 1;
    const clampedSlot = Math.max(minSlot, Math.min(maxSlot, slot));
    const leftSlot = Math.floor(clampedSlot);
    const rightSlot = Math.ceil(clampedSlot);
    if (leftSlot === rightSlot) {
      return LANE_SLOT_XS[leftSlot];
    }

    const t = clampedSlot - leftSlot;
    return LANE_SLOT_XS[leftSlot] + (LANE_SLOT_XS[rightSlot] - LANE_SLOT_XS[leftSlot]) * t;
  }

  function enemyLevel(distance) {
    const maxDistance = STATE_TOOLS.GAME.maxDistance;
    const clampedDistance = Math.max(1, Math.min(maxDistance, Math.round(Number(distance))));
    const closeness = maxDistance - clampedDistance;
    const denominator = Math.max(1, maxDistance - 1);
    return Math.max(1, Math.min(10, Math.round((closeness / denominator) * 9) + 1));
  }

  function isGameOverEnemy(displayState, enemy) {
    return displayState.gameOver && enemy?.distance <= 1;
  }

  function gameOverEnemyState(displayState, enemy) {
    if (!isGameOverEnemy(displayState, enemy)) {
      return null;
    }
    return displayState.gameOverEnemyBlinkOn ? "level10" : "off";
  }

  function gameOverGlobalState(displayState) {
    return displayState.gameOver ? displayState.gameOverLedState : null;
  }

  function enemyAtSlot(enemies, slot) {
    const enemyWidth = STATE_TOOLS.GAME.enemyWidth;
    return enemies.find((enemy) => slot >= enemy.start && slot < enemy.start + enemyWidth) ?? null;
  }

  function enemyLedColor(enemy) {
    if (enemy?.shot) {
      return COLORS.purple;
    }

    if (!enemy) {
      return COLORS.red;
    }

    return ENEMY_COLORS[enemyLevel(enemy.distance) - 1] ?? COLORS.red;
  }

  function enemyLedState(enemy) {
    return enemy?.shot ? "level10" : `enemy${enemyLevel(enemy.distance)}`;
  }

  function enemyCenter(enemy) {
    return enemy.start + (STATE_TOOLS.GAME.enemyWidth - 1) / 2;
  }

  function playerCenter(displayState) {
    return displayState.playerStart + (STATE_TOOLS.GAME.playerWidth - 1) / 2;
  }

  function priorityTickEnemy(displayState) {
    const activeEnemies = displayState.enemies.filter((enemy) => (
      !enemy.shot && Number.isFinite(Number(enemy.distance))
    ));
    if (displayState.gameOver || activeEnemies.length === 0) {
      return null;
    }

    const sortedEnemies = [...activeEnemies].sort((left, right) => {
      const distanceDiff = Number(left.distance) - Number(right.distance);
      if (distanceDiff !== 0) {
        return distanceDiff;
      }

      const center = playerCenter(displayState);
      const playerDistanceDiff = Math.abs(enemyCenter(left) - center) - Math.abs(enemyCenter(right) - center);
      if (playerDistanceDiff !== 0) {
        return playerDistanceDiff;
      }

      return enemyCenter(left) - enemyCenter(right);
    });

    const selectedEnemy = sortedEnemies[0];
    return {
      ...selectedEnemy,
      spatial: {
        relativeToPlayer: enemyCenter(selectedEnemy) - playerCenter(displayState),
      },
    };
  }

  function enemyOverlapsPlayer(displayState) {
    const playerStart = displayState.playerStart;
    const playerEnd = playerStart + STATE_TOOLS.GAME.playerWidth - 1;
    return displayState.enemies.some((enemy) => {
      if (enemy.shot) {
        return false;
      }
      const enemyStart = enemy.start;
      const enemyEnd = enemy.start + STATE_TOOLS.GAME.enemyWidth - 1;
      return enemyStart <= playerEnd && enemyEnd >= playerStart;
    });
  }

  function targetDisplaySlot(displayState) {
    const playerCenterOffset = (STATE_TOOLS.GAME.playerWidth - 1) / 2;
    if (displayState.displayMode === STATE_TOOLS.DISPLAY_MODES.FOV) {
      return centerStartDisplaySlot() + playerCenterOffset;
    }

    return displaySlotForField(displayState.playerStart) + playerCenterOffset;
  }

  function fieldSlotForDisplaySlot(displayState, displaySlot) {
    if (displayState.displayMode === STATE_TOOLS.DISPLAY_MODES.FOV) {
      return displayState.playerStart + displaySlot - centerStartDisplaySlot();
    }

    return displaySlot - STATE_TOOLS.GAME.displayPadding;
  }

  function fovWallAtSlot(displayState, displaySlot) {
    if (displayState.displayMode !== STATE_TOOLS.DISPLAY_MODES.FOV) {
      return false;
    }

    const wallPadding = STATE_TOOLS.GAME.fovWallPadding ?? 0;
    const leftWallSlot = centerStartDisplaySlot() - displayState.playerStart - 1 - wallPadding;
    const rightWallSlot = centerStartDisplaySlot() + STATE_TOOLS.GAME.playfieldSlots - displayState.playerStart + wallPadding;
    return displaySlot === leftWallSlot || displaySlot === rightWallSlot;
  }

  function fovOffscreenDirection(displayState) {
    if (displayState.displayMode !== STATE_TOOLS.DISPLAY_MODES.FOV) {
      return { left: false, right: false };
    }

    const leftLimit = 1;
    const rightLimit = STATE_TOOLS.GAME.displaySlots - 2;
    const startSlot = centerStartDisplaySlot();
    const enemyWidth = STATE_TOOLS.GAME.enemyWidth;
    const direction = { left: false, right: false };

    for (const enemy of displayState.enemies) {
      const enemyLeft = startSlot + enemy.start - displayState.playerStart;
      const enemyRight = enemyLeft + enemyWidth - 1;
      if (enemyRight < leftLimit) direction.left = true;
      if (enemyLeft > rightLimit) direction.right = true;
    }

    return direction;
  }

  function createLaneDots(displayState) {
    const { y } = LAYOUT.lane;
    const dots = [];
    const offscreen = fovOffscreenDirection(displayState);

    for (let slot = 0; slot < LANE_SLOT_XS.length; slot += 1) {
      const x = LANE_SLOT_XS[slot];
      const fieldSlot = fieldSlotForDisplaySlot(displayState, slot);
      const enemy = fieldSlot >= 0 && fieldSlot < STATE_TOOLS.GAME.playfieldSlots
        ? enemyAtSlot(displayState.enemies, fieldSlot)
        : null;
      const wall = fovWallAtSlot(displayState, slot);
      const offscreenMarker = displayState.displayMode === STATE_TOOLS.DISPLAY_MODES.FOV
        && ((slot === 0 && offscreen.left) || (slot === LANE_SLOT_XS.length - 1 && offscreen.right));
      const activeEnemy = Boolean(enemy || offscreenMarker);
      const enemyColor = enemyLedColor(enemy);
      const dotColor = wall ? COLORS.wall : (activeEnemy ? enemyColor : COLORS.laneOff);
      const dotGlow = wall ? COLORS.wall : (activeEnemy ? enemyColor : COLORS.laneOff);
      const gameOverEnemyLedState = enemy ? gameOverEnemyState(displayState, enemy) : null;
      dots.push(dot(x, y, {
        color: dotColor,
        glowColor: dotGlow,
        radius: activeEnemy || wall ? 3.25 : 2.55,
        state: gameOverEnemyLedState
          ?? (wall ? "level10" : (activeEnemy ? (enemy ? enemyLedState(enemy) : (blinkOn ? "level10" : "level3")) : "level2")),
        phase: slot * 0.08,
      }));
    }

    return new DotCollection(dots);
  }

  function createPowerColumn(displayState) {
    const dots = [];
    const x = LAYOUT.targetCenterX;
    const { top, rowGap, rows, columns, colGap } = LAYOUT.powerColumn;
    const halfWidth = ((columns - 1) * colGap) / 2;
    const powerLevel = Math.max(0, Math.min(rows, displayState.powerLevel));

    for (let row = 0; row < rows; row += 1) {
      const y = top + row * rowGap;
      const filled = row >= rows - powerLevel;
      const highPowerRow = row < 3;
      const state = filled ? (highPowerRow ? "powerPeak" : "powerMain") : "level1";
      const color = filled ? COLORS.violetWhite : COLORS.powerOff;
      const glowColor = filled ? COLORS.purple : COLORS.powerOff;
      for (let col = 0; col < columns; col += 1) {
        dots.push(dot(x - halfWidth + col * colGap, y, {
          color,
          glowColor,
          radius: highPowerRow ? 3 : 2.45,
          state,
          phase: row * 0.2 + col * 0.1,
        }));
      }
    }

    dots.push(dot(x, top + rows * rowGap + 4, {
      color: powerLevel > 0 ? COLORS.violetWhite : COLORS.powerOff,
      glowColor: powerLevel > 0 ? COLORS.purple : COLORS.powerOff,
      radius: 14,
      state: isPowerDotPulsing() ? "level10" : (powerLevel > 0 ? "level3" : "level1"),
    }));

    return new DotCollection(dots);
  }

  function autoCountdownSeconds(displayState) {
    if (!displayState.running || displayState.gameOver || displayState.autoEndsAt <= 0) {
      return null;
    }

    return Math.max(0, Math.ceil((displayState.autoEndsAt - Date.now()) / 1000));
  }

  function drawAutoCountdown(context, displayState) {
    const seconds = autoCountdownSeconds(displayState);
    if (seconds === null) {
      return;
    }

    const minutes = Math.floor(seconds / 60);
    const remainder = seconds % 60;
    const label = `${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;

    context.save();
    context.textAlign = "right";
    context.textBaseline = "middle";
    context.font = "700 34px system-ui, sans-serif";
    context.shadowColor = COLORS.blue;
    context.shadowBlur = 18;
    context.fillStyle = "#dbe9ff";
    context.fillText(label, LAYOUT.timer.x, LAYOUT.timer.y);
    context.shadowBlur = 0;
    context.strokeStyle = "rgba(71, 144, 255, 0.62)";
    context.lineWidth = 1.2;
    context.strokeText(label, LAYOUT.timer.x, LAYOUT.timer.y);
    context.restore();
  }

  function createScene(displayState, options = {}) {
    const scene = new LedScene({ stateOverride: gameOverGlobalState(displayState) });
    const centerLineY = LAYOUT.lane.y;
    const leftForce = displayState.inputForces.left;
    const rightForce = displayState.inputForces.right;
    const netForce = rightForce - leftForce;
    const leftArrowStyle = forceGraphicStyle(netForce < 0 ? Math.abs(netForce) : 0, COLORS.blue);
    const rightArrowStyle = forceGraphicStyle(netForce > 0 ? netForce : 0, COLORS.blue);
    const leftBikeStyle = forceGraphicStyle(leftForce, COLORS.cyanBlue, COLORS.blue);
    const rightBikeStyle = forceGraphicStyle(rightForce, COLORS.cyanBlue, COLORS.blue);
    const targetUsesFullForm = targetOuterShouldUseFullForm(displayState);
    const targetOuterState = targetUsesFullForm
      ? (blinkOn ? "level10" : "level1")
      : "level5";

    if (!options.skipOutline) {
      scene.add(createOutlineDots());
    }
    scene.add(createLaneDots(displayState));

    scene.add(createArrowGraphic({ x: LAYOUT.arrowTipInset, y: centerLineY }, -1, leftArrowStyle));
    scene.add(createArrowGraphic({ x: STAGE.width - LAYOUT.arrowTipInset, y: centerLineY }, 1, rightArrowStyle));
    scene.add(createBikeGraphic({ x: LAYOUT.bikeInset, y: LAYOUT.bikeY }, true, leftBikeStyle));
    scene.add(createBikeGraphic({ x: STAGE.width - LAYOUT.bikeInset, y: LAYOUT.bikeY }, false, rightBikeStyle));

    scene.add(createTargetGraphic(
      { x: slotCenterX(targetDisplaySlot(displayState)), y: centerLineY },
      {
        outerState: targetOuterState,
        forceFullOuter: targetUsesFullForm,
        includeOuter: !options.skipTargetOuter,
      }
    ));
    scene.add(createPowerColumn(displayState));

    scene.add({
      draw(context) {
        drawAutoCountdown(context, displayState);
      },
    });

    return scene;
  }

  function drawBackground(context) {
    context.fillStyle = "#000";
    context.fillRect(0, 0, STAGE.width, STAGE.height);

    const gradient = context.createRadialGradient(
      STAGE.width / 2,
      STAGE.height * 0.52,
      80,
      STAGE.width / 2,
      STAGE.height * 0.52,
      760
    );
    gradient.addColorStop(0, "rgba(60, 20, 120, 0.08)");
    gradient.addColorStop(0.28, "rgba(12, 24, 80, 0.04)");
    gradient.addColorStop(1, "rgba(0, 0, 0, 0)");
    context.fillStyle = gradient;
    context.fillRect(0, 0, STAGE.width, STAGE.height);
  }

  function getLetterboxMetrics(viewportWidth, viewportHeight) {
    const viewportAspect = viewportWidth / viewportHeight;
    const scale = viewportAspect > STAGE.aspect
      ? viewportHeight / STAGE.height
      : viewportWidth / STAGE.width;
    const stageWidth = STAGE.width * scale;
    const stageHeight = STAGE.height * scale;
    const offsetX = (viewportWidth - stageWidth) / 2;
    const offsetY = (viewportHeight - stageHeight) / 2;

    return { offsetX, offsetY, scale, stageWidth, stageHeight };
  }

  function createRenderCanvas(width, height) {
    if (typeof OffscreenCanvas === "function") {
      return new OffscreenCanvas(width, height);
    }

    const renderCanvas = document.createElement("canvas");
    renderCanvas.width = width;
    renderCanvas.height = height;
    return renderCanvas;
  }

  function createStageCache(scene) {
    const renderCanvas = createRenderCanvas(STAGE.width, STAGE.height);
    const renderContext = renderCanvas.getContext("2d", { alpha: false });

    scene.draw(renderContext, STATIC_PULSE);

    return renderCanvas;
  }

  function drawCachedStage(context, cache) {
    const viewportWidth = canvas.width;
    const viewportHeight = canvas.height;
    const metrics = getLetterboxMetrics(viewportWidth, viewportHeight);

    context.globalCompositeOperation = "source-over";
    context.globalAlpha = 1;
    context.clearRect(0, 0, viewportWidth, viewportHeight);
    context.fillStyle = "#000";
    context.fillRect(0, 0, viewportWidth, viewportHeight);
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(cache, metrics.offsetX, metrics.offsetY, metrics.stageWidth, metrics.stageHeight);
  }

  function scaledStageRect(rect) {
    const metrics = getLetterboxMetrics(canvas.width, canvas.height);
    return {
      sx: rect.x,
      sy: rect.y,
      sw: rect.width,
      sh: rect.height,
      dx: metrics.offsetX + rect.x * metrics.scale,
      dy: metrics.offsetY + rect.y * metrics.scale,
      dw: rect.width * metrics.scale,
      dh: rect.height * metrics.scale,
    };
  }

  function expandStageRect(rect, padding) {
    const x = Math.max(0, rect.x - padding);
    const y = Math.max(0, rect.y - padding);
    const right = Math.min(STAGE.width, rect.x + rect.width + padding);
    const bottom = Math.min(STAGE.height, rect.y + rect.height + padding);
    return { x, y, width: right - x, height: bottom - y };
  }

  function unionStageRects(rects) {
    if (rects.length === 0) {
      return null;
    }

    const left = Math.min(...rects.map((rect) => rect.x));
    const top = Math.min(...rects.map((rect) => rect.y));
    const right = Math.max(...rects.map((rect) => rect.x + rect.width));
    const bottom = Math.max(...rects.map((rect) => rect.y + rect.height));
    return { x: left, y: top, width: right - left, height: bottom - top };
  }

  function restoreStageRect(context, rect) {
    const expandedRect = expandStageRect(rect, DIRTY_REPAINT_PADDING);
    const scaledRect = scaledStageRect(expandedRect);

    context.save();
    context.globalCompositeOperation = "source-over";
    context.globalAlpha = 1;
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.beginPath();
    context.rect(scaledRect.dx, scaledRect.dy, scaledRect.dw, scaledRect.dh);
    context.clip();
    context.drawImage(
      stageCache,
      scaledRect.sx,
      scaledRect.sy,
      scaledRect.sw,
      scaledRect.sh,
      scaledRect.dx,
      scaledRect.dy,
      scaledRect.dw,
      scaledRect.dh
    );
    context.restore();
  }

  function drawInStageSpace(context, drawCallback) {
    const metrics = getLetterboxMetrics(canvas.width, canvas.height);
    context.save();
    context.translate(metrics.offsetX, metrics.offsetY);
    context.scale(metrics.scale, metrics.scale);
    drawCallback(context);
    context.restore();
  }

  function drawTargetArcOverlay(context) {
    const targetUsesFullForm = targetOuterShouldUseFullForm(displayState);
    if (!displayState.running || displayState.gameOver || targetUsesFullForm) {
      return;
    }

    const targetOuter = createTargetGraphic(
      { x: slotCenterX(targetDisplaySlot(displayState)), y: LAYOUT.lane.y },
      { includeInner: false, outerState: "level5" }
    );
    drawInStageSpace(context, (stageContext) => {
      targetOuter.draw(stageContext, STATIC_PULSE);
    });
  }

  function shouldDrawOutlineOverlay() {
    return !displayState.gameOver;
  }

  function drawOutlineOverlay(context) {
    if (!shouldDrawOutlineOverlay()) {
      return;
    }

    const outline = createOutlineDots();
    drawInStageSpace(context, (stageContext) => {
      outline.draw(stageContext, STATIC_PULSE);
    });
  }

  function drawDisplayFrameNow() {
    drawCachedStage(ctx, stageCache);
    drawOutlineOverlay(ctx);
    drawTargetArcOverlay(ctx);
  }

  function animatedDirtyRect() {
    const rects = [];
    if (shouldDrawOutlineOverlay()) {
      rects.push(DIRTY_RECTS.outline);
    }
    if (shouldAnimateTargetArc()) {
      rects.push(DIRTY_RECTS.target);
    }
    return unionStageRects(rects);
  }

  function drawAnimatedOverlayFrameNow() {
    const dirtyRect = animatedDirtyRect();
    if (!dirtyRect) {
      return;
    }

    restoreStageRect(ctx, dirtyRect);
    drawOutlineOverlay(ctx);
    drawTargetArcOverlay(ctx);
  }

  function scheduleCanvasFrame(callback) {
    if (document.visibilityState === "hidden" || displayFrameRequest) {
      return;
    }

    displayFrameRequest = window.requestAnimationFrame(() => {
      displayFrameRequest = null;
      callback();
    });
  }

  function drawDisplayFrame() {
    scheduleCanvasFrame(drawDisplayFrameNow);
  }

  function drawAnimatedOverlayFrame() {
    scheduleCanvasFrame(drawAnimatedOverlayFrameNow);
  }

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, MAX_DEVICE_PIXEL_RATIO);
    const nextWidth = Math.round(window.innerWidth * dpr);
    const nextHeight = Math.round(window.innerHeight * dpr);
    if (canvas.width !== nextWidth) {
      canvas.width = nextWidth;
    }
    if (canvas.height !== nextHeight) {
      canvas.height = nextHeight;
    }
    canvas.style.width = `${window.innerWidth}px`;
    canvas.style.height = `${window.innerHeight}px`;

    drawDisplayFrame();
  }

  function redrawDisplay() {
    stageCache = createStageCache(createScene(displayState, {
      skipOutline: shouldDrawOutlineOverlay(),
      skipTargetOuter: shouldAnimateTargetArc(),
    }));
    drawDisplayFrame();
  }

  function startOutlineMotion(playerDelta) {
    if (
      playerDelta === 0
      || displayState.gameOver
      || displayState.outlineEffectMode === STATE_TOOLS.OUTLINE_EFFECT_MODES.NONE
    ) {
      return;
    }

    const maxMove = STATE_TOOLS.GAME.maxPlayerMovePerStep ?? STATE_TOOLS.GAME.maxPlayerMovePerTick ?? 5;
    if (Math.abs(playerDelta) > maxMove) {
      return;
    }

    const now = performance.now();
    const effectDirection = displayState.outlineEffectMode === STATE_TOOLS.OUTLINE_EFFECT_MODES.REVERSE ? -1 : 1;
    const speed = Math.max(1, Math.min(maxMove, Math.abs(playerDelta)));
    setOutlineFlowDirection(Math.sign(playerDelta) * effectDirection, now);
    outlineMotion.activeUntil = Math.max(outlineMotion.activeUntil, now + MOVING_OUTLINE_MIN_MS);
    outlineMotion.velocity = MOVING_OUTLINE_SPEED_PER_MS * speed;
    scheduleOutlineAnimation();
  }

  function stopOutlineMotion() {
    if (outlineMotion) {
      outlineMotion.activeUntil = 0;
      outlineMotion.velocity = 0;
    }
    if (outlineAnimationFrame) {
      window.clearTimeout(outlineAnimationFrame);
      outlineAnimationFrame = null;
    }
  }

  function updateStandbyOutlineTimer() {
    const needsStandbyTimer = shouldUseStandbyOutline();
    if (needsStandbyTimer && !standbyOutlineTimer) {
      standbyOutlineTimer = window.setInterval(drawAnimatedOverlayFrame, STANDBY_OUTLINE_FRAME_MS);
      return;
    }

    if (!needsStandbyTimer && standbyOutlineTimer) {
      window.clearInterval(standbyOutlineTimer);
      standbyOutlineTimer = null;
    }
  }

  function scheduleOutlineAnimation() {
    if (outlineAnimationFrame) {
      return;
    }

    outlineAnimationFrame = window.setTimeout(animateOutline, MOVING_OUTLINE_FRAME_MS);
  }

  function animateOutline() {
    outlineAnimationFrame = null;
    updateOutlineFlow();
    if (!isOutlineMotionActive()) {
      redrawDisplay();
      return;
    }

    drawAnimatedOverlayFrame();
    scheduleOutlineAnimation();
  }

  function isPowerDotPulsing() {
    return Date.now() < powerDotPulseUntil;
  }

  function pulsePowerDot() {
    powerDotPulseUntil = Date.now() + POWER_DOT_PULSE_MS;
    if (powerDotPulseTimer) {
      window.clearTimeout(powerDotPulseTimer);
    }
    powerDotPulseTimer = window.setTimeout(() => {
      powerDotPulseTimer = null;
      redrawDisplay();
    }, POWER_DOT_PULSE_MS);
  }

  function maxPowerLevel() {
    return STATE_TOOLS.POWER?.maxLevel ?? STATE_TOOLS.POWER_LEVELS ?? LAYOUT.powerColumn.rows;
  }

  function pulseTargetShootBlink() {
    targetShootBlinkUntil = Date.now() + SHOOT_TARGET_BLINK_MS;
    if (targetShootBlinkTimer) {
      window.clearTimeout(targetShootBlinkTimer);
    }

    targetShootBlinkTimer = window.setTimeout(() => {
      targetShootBlinkTimer = null;
      updateBlinkTimer();
      updateTargetArcTimer();
      redrawDisplay();
    }, SHOOT_TARGET_BLINK_MS);
  }

  function clearGameStartOutlineBlinkTimers() {
    for (const timer of gameStartOutlineBlinkTimers) {
      window.clearTimeout(timer);
    }
    gameStartOutlineBlinkTimers.clear();
    gameStartOutlineBlinkUntil = 0;
  }

  function pulseGameStartOutline() {
    gameStartOutlineBlinkUntil = performance.now() + GAME_START_OUTLINE_BLINK_MS;
    drawAnimatedOverlayFrame();
    const timer = window.setTimeout(() => {
      gameStartOutlineBlinkTimers.delete(timer);
      drawAnimatedOverlayFrame();
    }, GAME_START_OUTLINE_BLINK_MS);
    gameStartOutlineBlinkTimers.add(timer);
  }

  function startGameStartOutlineBlinks() {
    clearGameStartOutlineBlinkTimers();
    const noteMs = STATE_TOOLS.GAME.gameStartNoteMs ?? 700;
    pulseGameStartOutline();
    [noteMs, noteMs * 2].forEach((delay) => {
      const timer = window.setTimeout(() => {
        gameStartOutlineBlinkTimers.delete(timer);
        pulseGameStartOutline();
      }, delay);
      gameStartOutlineBlinkTimers.add(timer);
    });
  }

  function shouldAnimateTargetArc() {
    return displayState.running
      && !displayState.gameOver
      && !targetOuterShouldUseFullForm(displayState);
  }

  function updateTargetArcTimer() {
    const needsTargetArcTimer = shouldAnimateTargetArc();
    if (needsTargetArcTimer && !targetArcTimer) {
      targetArcTimer = window.setInterval(drawAnimatedOverlayFrame, TARGET_ARC_FRAME_MS);
      return;
    }

    if (!needsTargetArcTimer && targetArcTimer) {
      window.clearInterval(targetArcTimer);
      targetArcTimer = null;
    }
  }

  function updateAutoCountdownTimer() {
    const needsCountdownTimer = autoCountdownSeconds(displayState) !== null;
    if (needsCountdownTimer && !autoCountdownTimer) {
      autoCountdownTimer = window.setInterval(redrawDisplay, 1000);
      return;
    }

    if (!needsCountdownTimer && autoCountdownTimer) {
      window.clearInterval(autoCountdownTimer);
      autoCountdownTimer = null;
    }
  }

  function updateBlinkTimer() {
    const offscreen = fovOffscreenDirection(displayState);
    const needsBlink = (!displayState.gameOver && enemyOverlapsPlayer(displayState))
      || isTargetShootBlinking()
      || (displayState.displayMode === STATE_TOOLS.DISPLAY_MODES.FOV && (offscreen.left || offscreen.right));
    const nextDelay = isTargetShootBlinking() ? 160 : 420;

    if (needsBlink && blinkTimer && blinkTimerDelay !== nextDelay) {
      window.clearInterval(blinkTimer);
      blinkTimer = null;
    }

    if (needsBlink && !blinkTimer) {
      blinkTimerDelay = nextDelay;
      blinkTimer = window.setInterval(() => {
        blinkOn = !blinkOn;
        redrawDisplay();
      }, nextDelay);
      return;
    }

    if (!needsBlink && blinkTimer) {
      window.clearInterval(blinkTimer);
      blinkTimer = null;
      blinkTimerDelay = 0;
      blinkOn = true;
    }
  }

  function renderDisplay(nextState) {
    const nextDisplayState = STATE_TOOLS.normalizeState(nextState);
    const nextStateKey = JSON.stringify(nextDisplayState);
    if (nextStateKey === lastRenderedStateKey) {
      return;
    }

    const playerDelta = nextDisplayState.playerStart - displayState.playerStart;
    const powerIncreased = nextDisplayState.powerLevel > displayState.powerLevel;
    const shotFired = displayState.powerLevel >= maxPowerLevel() && nextDisplayState.powerLevel === 0;
    const outlineEffectChanged = nextDisplayState.outlineEffectMode !== displayState.outlineEffectMode;
    if (outlineEffectChanged) {
      stopOutlineMotion();
    }
    startOutlineMotion(playerDelta);
    displayAudio.update(nextDisplayState, displayState, shotFired);
    if (!displayState.gameStarting && nextDisplayState.gameStarting) {
      startGameStartOutlineBlinks();
    } else if (displayState.gameStarting && !nextDisplayState.gameStarting) {
      clearGameStartOutlineBlinkTimers();
    }
    displayState = nextDisplayState;
    lastRenderedStateKey = nextStateKey;
    if (powerIncreased && !displayState.gameOver) {
      pulsePowerDot();
    }
    if (shotFired && !displayState.gameOver) {
      pulseTargetShootBlink();
    }
    updateBlinkTimer();
    updateStandbyOutlineTimer();
    updateTargetArcTimer();
    updateAutoCountdownTimer();
    redrawDisplay();
  }

  function handleVisibilityChange() {
    if (document.visibilityState === "hidden") {
      displayAudio.setCharging(false);
      displayAudio.updateEnemyTick(null);
      clearGameStartOutlineBlinkTimers();
      if (displayFrameRequest) {
        window.cancelAnimationFrame(displayFrameRequest);
        displayFrameRequest = null;
      }
      return;
    }

    updateStandbyOutlineTimer();
    updateTargetArcTimer();
    updateAutoCountdownTimer();
    redrawDisplay();
  }

  function connectStateStream() {
    if (typeof EventSource !== "function") {
      return;
    }

    const events = new EventSource("/events?role=display");
    events.addEventListener("message", (event) => {
      try {
        renderDisplay(JSON.parse(event.data));
      } catch (error) {
        console.error("Invalid display state", error);
      }
    });
  }

  function chooseSpeaker(role) {
    displayAudio.setSpeakerRole(role);
    if (speakerDialog) {
      speakerDialog.hidden = true;
    }
  }

  function fullscreenElement() {
    return document.fullscreenElement
      || document.webkitFullscreenElement
      || document.msFullscreenElement
      || null;
  }

  function requestFullscreen(element) {
    const request = element.requestFullscreen
      || element.webkitRequestFullscreen
      || element.msRequestFullscreen;
    if (request) {
      request.call(element).catch?.(() => {});
    }
  }

  function exitFullscreen() {
    const exit = document.exitFullscreen
      || document.webkitExitFullscreen
      || document.msExitFullscreen;
    if (exit) {
      exit.call(document).catch?.(() => {});
    }
  }

  function toggleFullscreen() {
    if (fullscreenElement()) {
      exitFullscreen();
      return;
    }
    requestFullscreen(document.documentElement);
  }

  function handleCanvasPointerUp(event) {
    if (event.pointerType === "mouse" || event.button !== 0) {
      return;
    }

    const now = Date.now();
    const closeInTime = now - lastCanvasTapAt < 340;
    const closeInSpace = Math.hypot(event.clientX - lastCanvasTapX, event.clientY - lastCanvasTapY) < 42;
    lastCanvasTapAt = now;
    lastCanvasTapX = event.clientX;
    lastCanvasTapY = event.clientY;
    if (closeInTime && closeInSpace) {
      event.preventDefault();
      lastCanvasTapAt = 0;
      toggleFullscreen();
    }
  }

  let displayState = STATE_TOOLS.normalizeState();
  let blinkOn = true;
  let blinkTimer = null;
  let blinkTimerDelay = 0;
  let powerDotPulseUntil = 0;
  let powerDotPulseTimer = null;
  let targetShootBlinkUntil = 0;
  let targetShootBlinkTimer = null;
  let targetArcTimer = null;
  let autoCountdownTimer = null;
  let gameStartOutlineBlinkUntil = 0;
  const gameStartOutlineBlinkTimers = new Set();
  let outlineMotion = null;
  let outlineAnimationFrame = null;
  let standbyOutlineTimer = null;
  let displayFrameRequest = null;
  let lastCanvasTapAt = 0;
  let lastCanvasTapX = 0;
  let lastCanvasTapY = 0;
  const displayAudio = new DisplayAudio();
  let stageCache = createStageCache(createScene(displayState, {
    skipOutline: shouldDrawOutlineOverlay(),
    skipTargetOuter: shouldAnimateTargetArc(),
  }));
  let lastRenderedStateKey = JSON.stringify(displayState);

  window.addEventListener("resize", resize);
  window.addEventListener("pointerdown", () => displayAudio.unlock(), { once: true });
  window.addEventListener("keydown", () => displayAudio.unlock(), { once: true });
  canvas.addEventListener("dblclick", (event) => {
    event.preventDefault();
    toggleFullscreen();
  });
  canvas.addEventListener("pointerup", handleCanvasPointerUp);
  speakerLeftButton?.addEventListener("click", () => chooseSpeaker("left"));
  speakerStereoButton?.addEventListener("click", () => chooseSpeaker("stereo"));
  speakerRightButton?.addEventListener("click", () => chooseSpeaker("right"));
  document.addEventListener("visibilitychange", handleVisibilityChange);
  resize();
  updateStandbyOutlineTimer();
  connectStateStream();
})();
