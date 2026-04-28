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
  });
  const GAME = Object.freeze({
    enemyWidth: 4,
    enemyGap: 1,
    displaySlots: 88,
    displayPadding: 2,
    maxDistance: 10,
    gameOverAllBlinkMs: 560,
    gameOverEnemyBlinkMs: 3000,
    gameOverEnemyBlinkIntervalMs: 220,
    gameOverResetPauseMs: 700,
    maxPlayerMovePerTick: 5,
    movementTickMs: 300,
    playerWidth: 4,
    playfieldSlots: 84,
    tickMs: 800,
  });
  const DISPLAY_MODES = Object.freeze({
    TARGET: "target",
    FOV: "fov",
  });
  const INITIAL_PLAYER_START = Math.floor((GAME.playfieldSlots - GAME.playerWidth) / 2);
  const DEFAULT_STATE = Object.freeze({
    powerLevel: 0,
    enemies: [],
    playerStart: INITIAL_PLAYER_START,
    displayMode: DISPLAY_MODES.TARGET,
    inputForces: { left: 0, right: 0 },
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
      enemies: normalizeEnemies(value.enemies),
      playerStart: clampPlayerStart(value.playerStart ?? DEFAULT_STATE.playerStart),
      displayMode: normalizeDisplayMode(value.displayMode ?? DEFAULT_STATE.displayMode),
      inputForces: normalizeInputForces(value.inputForces ?? DEFAULT_STATE.inputForces),
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
    GAME,
    POWER,
    INITIAL_PLAYER_START,
    POWER_LEVELS: POWER.maxLevel,
    PURPLE_LEVELS: POWER.maxLevel,
    DEFAULT_STATE,
    clampPlayerStart,
    clampPowerLevel,
    clampPurpleLevel: clampPowerLevel,
    normalizeInputForces,
    normalizeDisplayMode,
    normalizeState,
  });
}));
