(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  root.LedDefenseState = api;
}(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const POWER = Object.freeze({
    maxLevel: 18,
    chargeMs: 120,
    drainMs: 260,
    fireHoldMs: 160,
  });
  const GAME = Object.freeze({
    enemyWidth: 4,
    enemyGap: 1,
    displaySlots: 88,
    displayPadding: 0,
    fovWallPadding: 2,
    maxDistance: 10,
    gameOverAllBlinkMs: 560,
    gameOverEnemyBlinkMs: 3000,
    gameOverEnemyBlinkIntervalMs: 220,
    gameOverResetPauseMs: 700,
    gameStartCountdownMs: 3300,
    gameStartNoteMs: 1000,
    shotEnemyMs: 500,
    maxPlayerMovePerStep: 5,
    movementImpulseMs: 1200,
    movementSettleMs: 40,
    movementStepMs: 120,
    playerMoveUnitsPerTap: 1,
    playerWidth: 4,
    playfieldSlots: 88,
    tickMs: 2000,
  });
  const DISPLAY_MODES = Object.freeze({
    TARGET: "target",
    FOV: "fov",
  });
  const OUTLINE_EFFECT_MODES = Object.freeze({
    NONE: "none",
    SAME: "same",
    REVERSE: "reverse",
  });
  const GAME_RUN_MODES = Object.freeze({
    MANUAL: "manual",
    AUTO: "auto",
  });
  const GAME_AUTOMATION = Object.freeze({
    defaultDurationMs: 120000,
    defaultMode: GAME_RUN_MODES.AUTO,
    defaultSpawnIntervalMs: 7000,
    maxDurationMs: 10 * 60 * 1000,
    maxSpawnIntervalMs: 15000,
    minDurationMs: 5000,
    minSpawnIntervalMs: 500,
  });
  const INITIAL_PLAYER_START = Math.floor((GAME.playfieldSlots - GAME.playerWidth) / 2);
  const DEFAULT_STATE = Object.freeze({
    powerLevel: 0,
    powerCharging: false,
    enemies: [],
    playerStart: INITIAL_PLAYER_START,
    displayMode: DISPLAY_MODES.TARGET,
    outlineEffectMode: OUTLINE_EFFECT_MODES.SAME,
    inputForces: { left: 0, right: 0 },
    gameStarting: false,
    autoEndsAt: 0,
    running: false,
    gameOver: false,
    gameOverStartedAt: 0,
    gameOverEnemyBlinkOn: false,
    gameOverLedState: null,
  });

  function clampPowerLevel(value) {
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) {
      return DEFAULT_STATE.powerLevel;
    }
    return Math.max(0, Math.min(POWER.maxLevel, Math.round(numericValue)));
  }

  function normalizeState(value = {}) {
    return {
      powerLevel: clampPowerLevel(value.powerLevel ?? value.purpleLevel ?? DEFAULT_STATE.powerLevel),
      powerCharging: Boolean(value.powerCharging),
      enemies: normalizeEnemies(value.enemies),
      playerStart: clampPlayerStart(value.playerStart ?? DEFAULT_STATE.playerStart),
      displayMode: normalizeDisplayMode(value.displayMode ?? DEFAULT_STATE.displayMode),
      outlineEffectMode: normalizeOutlineEffectMode(value.outlineEffectMode ?? DEFAULT_STATE.outlineEffectMode),
      inputForces: normalizeInputForces(value.inputForces ?? DEFAULT_STATE.inputForces),
      gameStarting: Boolean(value.gameStarting),
      autoEndsAt: normalizeTimestamp(value.autoEndsAt),
      running: Boolean(value.running),
      gameOver: Boolean(value.gameOver),
      gameOverStartedAt: normalizeTimestamp(value.gameOverStartedAt),
      gameOverEnemyBlinkOn: Boolean(value.gameOverEnemyBlinkOn),
      gameOverLedState: normalizeLedState(value.gameOverLedState),
    };
  }

  function normalizeLedState(value) {
    return value === "level10" || value === "off" ? value : null;
  }

  function normalizeTimestamp(value) {
    const numericValue = Number(value);
    return Number.isFinite(numericValue) && numericValue > 0 ? Math.round(numericValue) : 0;
  }

  function clampPlayerStart(value) {
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) {
      return DEFAULT_STATE.playerStart;
    }

    return Math.max(0, Math.min(GAME.playfieldSlots - GAME.playerWidth, Math.round(numericValue)));
  }

  function normalizeDisplayMode(value) {
    return value === DISPLAY_MODES.FOV ? DISPLAY_MODES.FOV : DISPLAY_MODES.TARGET;
  }

  function normalizeOutlineEffectMode(value) {
    if (value === OUTLINE_EFFECT_MODES.NONE || value === OUTLINE_EFFECT_MODES.REVERSE) {
      return value;
    }
    return OUTLINE_EFFECT_MODES.SAME;
  }

  function normalizeGameRunMode(value) {
    return value === GAME_RUN_MODES.AUTO ? GAME_RUN_MODES.AUTO : GAME_RUN_MODES.MANUAL;
  }

  function clampGameDurationMs(value) {
    return clampConfigMs(value, GAME_AUTOMATION.minDurationMs, GAME_AUTOMATION.maxDurationMs, GAME_AUTOMATION.defaultDurationMs);
  }

  function clampSpawnIntervalMs(value) {
    return clampConfigMs(
      value,
      GAME_AUTOMATION.minSpawnIntervalMs,
      GAME_AUTOMATION.maxSpawnIntervalMs,
      GAME_AUTOMATION.defaultSpawnIntervalMs
    );
  }

  function clampConfigMs(value, min, max, fallback) {
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) {
      return fallback;
    }
    return Math.max(min, Math.min(max, Math.round(numericValue)));
  }

  function normalizeEnemy(enemy) {
    const start = Math.round(Number(enemy?.start));
    const distance = Math.round(Number(enemy?.distance));
    if (!Number.isFinite(start) || !Number.isFinite(distance)) {
      return null;
    }

    const maxStart = GAME.playfieldSlots - GAME.enemyWidth;
    return {
      id: String(enemy.id ?? `${start}-${distance}`),
      start: Math.max(0, Math.min(maxStart, start)),
      distance: Math.max(1, Math.min(GAME.maxDistance, distance)),
      shot: Boolean(enemy.shot),
    };
  }

  function normalizeEnemies(value) {
    if (!Array.isArray(value)) {
      return [];
    }

    return value
      .map(normalizeEnemy)
      .filter(Boolean);
  }

  function clampForce(value) {
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) {
      return 0;
    }
    return Math.max(0, Math.min(99, Math.round(numericValue)));
  }

  function normalizeInputForces(value = {}) {
    return {
      left: clampForce(value.left),
      right: clampForce(value.right),
    };
  }

  return Object.freeze({
    DISPLAY_MODES,
    GAME_AUTOMATION,
    GAME_RUN_MODES,
    OUTLINE_EFFECT_MODES,
    GAME,
    POWER,
    INITIAL_PLAYER_START,
    POWER_LEVELS: POWER.maxLevel,
    PURPLE_LEVELS: POWER.maxLevel,
    DEFAULT_STATE,
    clampGameDurationMs,
    clampPlayerStart,
    clampPowerLevel,
    clampPurpleLevel: clampPowerLevel,
    clampSpawnIntervalMs,
    normalizeInputForces,
    normalizeDisplayMode,
    normalizeGameRunMode,
    normalizeOutlineEffectMode,
    normalizeState,
  });
}));
