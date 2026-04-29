"use strict";

const fs = require("fs");
const http = require("http");
const path = require("path");
const {
  DEFAULT_STATE,
  GAME,
  GAME_AUTOMATION,
  GAME_RUN_MODES,
  POWER,
  clampGameDurationMs,
  clampPlayerStart,
  clampPowerLevel,
  clampSpawnIntervalMs,
  normalizeDisplayMode,
  normalizeGameRunMode,
  normalizeInputForces,
  normalizeOutlineEffectMode,
  normalizeState,
} = require("./state");

const HOST = process.env.HOST || "127.0.0.1";
const PORT = Number(process.env.PORT || 4173);
const ROOT = __dirname;
const ROOT_PREFIX = `${ROOT}${path.sep}`;
const SSE_HEARTBEAT_MS = 15000;
const clients = new Set();
let state = normalizeState(DEFAULT_STATE);
let tickTimer = null;
let movementTimer = null;
let movementSettleTimer = null;
let powerTimer = null;
let powerFireTimer = null;
let gameStartTimer = null;
let autoSpawnTimer = null;
let autoStopTimer = null;
const gameOverAnimationTimers = new Set();
const shotAnimationTimers = new Set();
let nextEnemyId = 1;
let playerForces = { left: 0, right: 0 };
let pendingPlayerForces = { left: 0, right: 0 };
let playerImpulses = [];
let lastPlayerMoveAt = 0;
let autoGame = null;
let manualGameActive = false;
const chargingClients = new Set();

const MIME_TYPES = Object.freeze({
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
});

function sendJson(response, status, payload) {
  const body = JSON.stringify(payload);
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
  });
  response.end(body);
}

function sendEmpty(response, status = 204) {
  response.writeHead(status);
  response.end();
}

function parseJsonBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1024 * 1024) {
        reject(new Error("Request body is too large"));
        request.destroy();
      }
    });
    request.on("end", () => {
      if (!body) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(error);
      }
    });
    request.on("error", reject);
  });
}

function normalizeClientRole(value) {
  if (value === "display" || value === "controller") {
    return value;
  }
  return "unknown";
}

function connectedDisplayCount() {
  pruneDisconnectedClients();
  let count = 0;
  for (const client of clients) {
    if (client.role === "display") {
      count += 1;
    }
  }
  return count;
}

function statePayload() {
  return {
    ...state,
    connectedDisplayCount: connectedDisplayCount(),
  };
}

function sendState(client) {
  client.response.write(`data: ${JSON.stringify(statePayload())}\n\n`);
}

function isClientConnected(client) {
  const { response } = client;
  return !response.destroyed
    && !response.writableEnded
    && !response.socket?.destroyed;
}

function pruneDisconnectedClients() {
  for (const client of clients) {
    if (!isClientConnected(client)) {
      clients.delete(client);
    }
  }
}

function broadcastState() {
  pruneDisconnectedClients();
  for (const client of clients) {
    try {
      sendState(client);
    } catch (error) {
      clients.delete(client);
    }
  }
}

function stopTick() {
  if (tickTimer) {
    clearInterval(tickTimer);
    tickTimer = null;
  }
}

function stopMovementTimer() {
  if (movementTimer) {
    clearInterval(movementTimer);
    movementTimer = null;
  }
  if (movementSettleTimer) {
    clearTimeout(movementSettleTimer);
    movementSettleTimer = null;
  }
}

function stopPowerTimer() {
  if (powerTimer) {
    clearTimeout(powerTimer);
    powerTimer = null;
  }
  if (powerFireTimer) {
    clearTimeout(powerFireTimer);
    powerFireTimer = null;
  }
}

function stopAutoGameTimers() {
  if (autoSpawnTimer) {
    clearInterval(autoSpawnTimer);
    autoSpawnTimer = null;
  }
  if (autoStopTimer) {
    clearTimeout(autoStopTimer);
    autoStopTimer = null;
  }
  autoGame = null;
}

function stopGameStartTimer() {
  if (gameStartTimer) {
    clearTimeout(gameStartTimer);
    gameStartTimer = null;
  }
}

function runningForEnemies(enemies) {
  return manualGameActive || Boolean(autoGame) || enemies.length > 0;
}

function autoEndsAt() {
  return autoGame?.endsAt ?? 0;
}

function stopGameOverAnimationTimers() {
  for (const timer of gameOverAnimationTimers) {
    clearTimeout(timer);
  }
  gameOverAnimationTimers.clear();
}

function stopShotAnimationTimers() {
  for (const timer of shotAnimationTimers) {
    clearTimeout(timer);
  }
  shotAnimationTimers.clear();
}

function resetPlayerForces() {
  playerImpulses = [];
  playerForces = { left: 0, right: 0 };
  pendingPlayerForces = { left: 0, right: 0 };
  lastPlayerMoveAt = 0;
  stopMovementTimer();
}

function resetPowerInput() {
  chargingClients.clear();
  stopPowerTimer();
}

function powerChargingState() {
  return chargingClients.size > 0;
}

function publishPlayerForces() {
  updateState({ inputForces: normalizeInputForces(playerForces) });
}

function setState(nextState) {
  state = normalizeState(nextState);
  broadcastState();
}

function resetStateTo(nextState) {
  stopGameOverAnimationTimers();
  stopShotAnimationTimers();
  stopGameStartTimer();
  stopAutoGameTimers();
  stopTick();
  resetPlayerForces();
  resetPowerInput();
  manualGameActive = false;
  nextEnemyId = 1;
  setState(nextState);
}

function resetState() {
  resetStateTo(DEFAULT_STATE);
}

function resetGameState(visualSettings = {}) {
  const displayMode = normalizeDisplayMode(visualSettings.displayMode ?? state.displayMode);
  const outlineEffectMode = normalizeOutlineEffectMode(visualSettings.outlineEffectMode ?? state.outlineEffectMode);
  resetStateTo({
    ...DEFAULT_STATE,
    displayMode,
    outlineEffectMode,
  });
}

function updateState(patch) {
  setState({ ...state, ...patch });
}

function tickGame() {
  if (state.gameOver) {
    stopTick();
    return;
  }

  const shotEnemies = state.enemies.filter((enemy) => enemy.shot);
  const activeEnemies = state.enemies.filter((enemy) => !enemy.shot);

  if (activeEnemies.some((enemy) => enemy.distance <= 1)) {
    triggerGameOver();
    return;
  }

  const movedEnemies = activeEnemies
    .map((enemy) => ({ ...enemy, distance: enemy.distance - 1 }))
    .filter((enemy) => enemy.distance > 0);
  const enemies = [
    ...shotEnemies,
    ...movedEnemies,
  ].sort((left, right) => left.start - right.start);

  if (movedEnemies.length === 0) {
    stopTick();
  }

  setState({ ...state, autoEndsAt: autoEndsAt(), enemies, running: runningForEnemies(enemies) });
}

function triggerGameOver() {
  manualGameActive = false;
  stopGameStartTimer();
  stopShotAnimationTimers();
  stopAutoGameTimers();
  stopTick();
  resetPlayerForces();
  resetPowerInput();
  const gameOverStartedAt = Date.now();
  setState({
    ...state,
    inputForces: playerForces,
    gameStarting: false,
    running: false,
    gameOver: true,
    gameOverStartedAt,
    gameOverEnemyBlinkOn: true,
    gameOverLedState: null,
  });
  scheduleGameOverAnimation();
}

function scheduleGameOverAnimation() {
  stopGameOverAnimationTimers();

  for (
    let elapsed = GAME.gameOverEnemyBlinkIntervalMs;
    elapsed < GAME.gameOverEnemyBlinkMs;
    elapsed += GAME.gameOverEnemyBlinkIntervalMs
  ) {
    scheduleGameOverAnimationStep(() => {
      updateGameOverAnimation({
        gameOverEnemyBlinkOn: Math.floor(elapsed / GAME.gameOverEnemyBlinkIntervalMs) % 2 === 0,
        gameOverLedState: null,
      });
    }, elapsed);
  }

  scheduleGameOverAnimationStep(() => {
    updateGameOverAnimation({ gameOverEnemyBlinkOn: false, gameOverLedState: "level10" });
  }, GAME.gameOverEnemyBlinkMs);

  scheduleGameOverAnimationStep(() => {
    updateGameOverAnimation({ gameOverEnemyBlinkOn: false, gameOverLedState: "off" });
  }, GAME.gameOverEnemyBlinkMs + GAME.gameOverAllBlinkMs / 2);

  scheduleGameOverAnimationStep(() => {
    resetGameState();
  }, GAME.gameOverEnemyBlinkMs + GAME.gameOverAllBlinkMs + GAME.gameOverResetPauseMs);
}

function scheduleGameOverAnimationStep(callback, delay) {
  const timer = setTimeout(() => {
    gameOverAnimationTimers.delete(timer);
    callback();
  }, delay);
  gameOverAnimationTimers.add(timer);
}

function updateGameOverAnimation(patch) {
  if (!state.gameOver) {
    return;
  }
  updateState(patch);
}

function startTick() {
  if (!tickTimer) {
    tickTimer = setInterval(tickGame, GAME.tickMs);
  }
}

function startGame(config = {}) {
  const mode = normalizeGameRunMode(config.mode ?? GAME_AUTOMATION.defaultMode);
  const durationMs = clampGameDurationMs(config.durationMs);
  const spawnIntervalMs = clampSpawnIntervalMs(config.spawnIntervalMs);
  const displayMode = normalizeDisplayMode(config.displayMode ?? state.displayMode);
  const outlineEffectMode = normalizeOutlineEffectMode(config.outlineEffectMode ?? state.outlineEffectMode);

  resetGameState({ displayMode, outlineEffectMode });
  updateState({ gameStarting: true, running: false });
  gameStartTimer = setTimeout(() => {
    gameStartTimer = null;
    beginStartedGame({ durationMs, mode, spawnIntervalMs });
  }, GAME.gameStartCountdownMs ?? 2400);
}

function beginStartedGame(config) {
  if (state.gameOver || !state.gameStarting) {
    return;
  }

  const { durationMs, mode, spawnIntervalMs } = config;
  if (mode === GAME_RUN_MODES.MANUAL) {
    manualGameActive = true;
    updateState({ autoEndsAt: 0, gameStarting: false, running: true });
    return;
  }

  autoGame = {
    endsAt: Date.now() + durationMs,
    spawnIntervalMs,
  };
  updateState({ autoEndsAt: autoEndsAt(), gameStarting: false, running: true });
  spawnEnemy();
  autoSpawnTimer = setInterval(() => {
    if (!autoGame || state.gameOver) {
      stopAutoGameTimers();
      return;
    }
    spawnEnemy();
  }, spawnIntervalMs);
  autoStopTimer = setTimeout(() => {
    resetGameState();
  }, durationMs);
}

function overlapsEnemy(start, enemy) {
  const end = start + GAME.enemyWidth - 1;
  const enemyEnd = enemy.start + GAME.enemyWidth - 1;
  return start <= enemyEnd + GAME.enemyGap && end >= enemy.start - GAME.enemyGap;
}

function enemyOverlapsPlayer(enemy) {
  if (enemy.shot) {
    return false;
  }

  const playerEnd = state.playerStart + GAME.playerWidth - 1;
  const enemyEnd = enemy.start + GAME.enemyWidth - 1;
  return enemy.start <= playerEnd && enemyEnd >= state.playerStart;
}

function legalSpawnStarts() {
  const maxStart = GAME.playfieldSlots - GAME.enemyWidth;
  const starts = [];
  for (let start = 0; start <= maxStart; start += 1) {
    if (!state.enemies.some((enemy) => overlapsEnemy(start, enemy))) {
      starts.push(start);
    }
  }
  return starts;
}

function removeShotEnemies(enemyIds) {
  const idSet = new Set(enemyIds);
  const enemies = state.enemies.filter((enemy) => !(enemy.shot && idSet.has(enemy.id)));
  const activeEnemies = enemies.filter((enemy) => !enemy.shot);
  if (activeEnemies.length === 0) {
    stopTick();
  }
  setState({
    ...state,
    autoEndsAt: autoEndsAt(),
    enemies,
    running: runningForEnemies(enemies),
  });
}

function scheduleShotEnemyRemoval(enemyIds) {
  const timer = setTimeout(() => {
    shotAnimationTimers.delete(timer);
    removeShotEnemies(enemyIds);
  }, GAME.shotEnemyMs ?? 500);
  shotAnimationTimers.add(timer);
}

function spawnEnemy(requestedStartValue) {
  if (state.gameOver || state.gameStarting) {
    return false;
  }

  const starts = legalSpawnStarts();
  if (starts.length === 0) {
    return false;
  }

  const requestedStart = Math.round(Number(requestedStartValue));
  const start = starts.includes(requestedStart)
    ? requestedStart
    : starts[Math.floor(Math.random() * starts.length)];
  const enemies = [
    ...state.enemies,
    { id: String(nextEnemyId), start, distance: GAME.maxDistance },
  ].sort((left, right) => left.start - right.start);
  nextEnemyId += 1;
  setState({ ...state, autoEndsAt: autoEndsAt(), enemies, running: true });
  startTick();
  return true;
}

function shootPower() {
  if (state.gameOver) {
    resetPowerInput();
    return;
  }

  resetPowerInput();
  const shotEnemyIds = [];
  const enemies = state.enemies.map((enemy) => {
    if (!enemy.shot && enemyOverlapsPlayer(enemy)) {
      shotEnemyIds.push(enemy.id);
      return { ...enemy, shot: true };
    }
    return enemy;
  });
  const activeEnemies = enemies.filter((enemy) => !enemy.shot);
  updateState({
    enemies,
    powerLevel: 0,
    powerCharging: false,
    running: runningForEnemies(enemies),
  });
  if (activeEnemies.length === 0) {
    stopTick();
  }
  if (shotEnemyIds.length > 0) {
    scheduleShotEnemyRemoval(shotEnemyIds);
  }
}

function schedulePowerTimer() {
  if (powerTimer) {
    return;
  }

  const charging = chargingClients.size > 0;
  if (!charging && state.powerLevel <= 0) {
    return;
  }
  if (charging && state.powerLevel >= POWER.maxLevel) {
    return;
  }

  powerTimer = setTimeout(tickPower, charging ? POWER.chargeMs : POWER.drainMs);
}

function schedulePowerFire() {
  if (powerFireTimer) {
    return;
  }

  powerFireTimer = setTimeout(() => {
    powerFireTimer = null;
    shootPower();
  }, POWER.fireHoldMs ?? 160);
}

function tickPower() {
  powerTimer = null;

  if (state.gameOver) {
    resetPowerInput();
    return;
  }

  if (chargingClients.size > 0) {
    if (state.powerLevel < POWER.maxLevel) {
      const nextPowerLevel = clampPowerLevel(state.powerLevel + 1);
      updateState({ powerLevel: nextPowerLevel });
      if (nextPowerLevel >= POWER.maxLevel) {
        schedulePowerFire();
        return;
      }
    }
  } else if (state.powerLevel > 0) {
    updateState({ powerLevel: clampPowerLevel(state.powerLevel - 1) });
  }

  schedulePowerTimer();
}

function normalizeClientId(value) {
  const id = String(value ?? "").trim();
  return id ? id.slice(0, 80) : "anonymous";
}

function pressPower(clientIdValue) {
  if (state.gameOver) {
    return;
  }

  if (state.powerLevel >= POWER.maxLevel) {
    schedulePowerFire();
    return;
  }

  chargingClients.add(normalizeClientId(clientIdValue));
  updateState({ powerCharging: powerChargingState() });
  stopPowerTimer();
  schedulePowerTimer();
}

function releasePower(clientIdValue) {
  if (state.gameOver) {
    resetPowerInput();
    return;
  }

  chargingClients.delete(normalizeClientId(clientIdValue));
  updateState({ powerCharging: powerChargingState() });
  stopPowerTimer();
  schedulePowerTimer();
}

function nextPlayerStart(delta) {
  const nextPlayerStart = clampPlayerStart(state.playerStart + delta);
  return nextPlayerStart;
}

function movementStepMs() {
  return GAME.movementStepMs ?? 250;
}

function movementImpulseMs() {
  return GAME.movementImpulseMs ?? Math.max(700, movementStepMs() * 3);
}

function movementSettleMs() {
  return GAME.movementSettleMs ?? 60;
}

function maxPlayerMovePerStep() {
  return GAME.maxPlayerMovePerStep ?? GAME.maxPlayerMovePerTick ?? 2;
}

function playerMoveUnitsPerTap() {
  return GAME.playerMoveUnitsPerTap ?? 1;
}

function updateActivePlayerForces(now = Date.now()) {
  playerImpulses = playerImpulses.filter((impulse) => impulse.expiresAt > now);
  playerForces = playerImpulses.reduce((forces, impulse) => {
    forces[impulse.direction] += 1;
    return forces;
  }, { left: 0, right: 0 });
  return playerForces;
}

function playerForceMagnitude(netForce) {
  return Math.min(maxPlayerMovePerStep(), Math.max(1, Math.abs(netForce) * playerMoveUnitsPerTap()));
}

function hasPendingPlayerForces() {
  return pendingPlayerForces.left + pendingPlayerForces.right > 0;
}

function scheduleMovementSettle() {
  if (movementSettleTimer) {
    return;
  }

  movementSettleTimer = setTimeout(() => {
    movementSettleTimer = null;
    resolvePlayerMotion({ immediate: true });
  }, movementSettleMs());
}

function stopMovementIfIdle(activeForceCount) {
  if (activeForceCount === 0 && !hasPendingPlayerForces()) {
    stopMovementTimer();
  }
}

function resolvePlayerMotion({ immediate = false } = {}) {
  const now = Date.now();
  const activeForces = updateActivePlayerForces(now);
  const activeForceCount = activeForces.left + activeForces.right;

  if (!hasPendingPlayerForces()) {
    stopMovementIfIdle(activeForceCount);
    if (state.inputForces.left !== 0 || state.inputForces.right !== 0) {
      publishPlayerForces();
    }
    return;
  }

  if (!immediate && now - lastPlayerMoveAt < movementStepMs()) {
    publishPlayerForces();
    return;
  }

  const { left, right } = pendingPlayerForces;
  pendingPlayerForces = { left: 0, right: 0 };
  const netForce = right - left;

  if (netForce === 0) {
    stopMovementIfIdle(activeForceCount);
    publishPlayerForces();
    return;
  }

  const playerStart = nextPlayerStart(Math.sign(netForce) * playerForceMagnitude(netForce));
  lastPlayerMoveAt = now;
  updateState({
    inputForces: normalizeInputForces(playerForces),
    playerStart,
  });
}

function startMovementTimer() {
  if (!movementTimer) {
    movementTimer = setInterval(resolvePlayerMotion, movementStepMs());
  }
}

function addPlayerForce(direction) {
  if (state.gameOver) {
    return;
  }

  const now = Date.now();
  const forceDirection = direction < 0 ? "left" : "right";
  pendingPlayerForces[forceDirection] += 1;
  playerImpulses.push({
    direction: forceDirection,
    expiresAt: now + movementImpulseMs(),
  });
  updateActivePlayerForces(now);
  publishPlayerForces();
  if (now - lastPlayerMoveAt >= movementStepMs()) {
    scheduleMovementSettle();
  }
  startMovementTimer();
}

function normalizeStartGameBody(body = {}) {
  const durationMs = body.durationMs ?? Number(body.durationSeconds) * 1000;
  const spawnIntervalMs = body.spawnIntervalMs ?? Number(body.spawnIntervalSeconds) * 1000;
  return {
    displayMode: body.displayMode,
    durationMs,
    mode: body.mode,
    outlineEffectMode: body.outlineEffectMode,
    spawnIntervalMs,
  };
}

function handleEvents(request, response, searchParams) {
  const client = {
    response,
    role: normalizeClientRole(searchParams.get("role")),
  };
  let heartbeatTimer = null;

  response.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  response.write(": connected\n\n");
  clients.add(client);
  sendState(client);
  broadcastState();

  const cleanup = () => {
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
    if (clients.delete(client)) {
      broadcastState();
    }
  };
  heartbeatTimer = setInterval(() => {
    if (!isClientConnected(client)) {
      cleanup();
      return;
    }

    try {
      response.write(": heartbeat\n\n");
    } catch (error) {
      cleanup();
    }
  }, SSE_HEARTBEAT_MS);
  heartbeatTimer.unref?.();
  request.on("close", cleanup);
  request.on("aborted", cleanup);
  response.on("error", cleanup);
  response.on("close", cleanup);
}

function resolveStaticPath(urlPathname) {
  const routePath = urlPathname === "/" ? "/controller.html" : urlPathname;
  const displayRoutePath = routePath === "/display" ? "/index.html" : routePath;
  const viewRoutePath = displayRoutePath === "/simple" ? "/simple-controller.html" : displayRoutePath;
  const normalizedPath = path.normalize(viewRoutePath).replace(/^([/\\])/, "");
  const filePath = path.resolve(ROOT, normalizedPath);
  return filePath === ROOT || filePath.startsWith(ROOT_PREFIX) ? filePath : null;
}

function serveStatic(request, response, urlPathname) {
  const filePath = resolveStaticPath(urlPathname);
  if (!filePath) {
    sendEmpty(response, 403);
    return;
  }

  fs.readFile(filePath, (error, data) => {
    if (error) {
      sendEmpty(response, error.code === "ENOENT" ? 404 : 500);
      return;
    }

    response.writeHead(200, {
      "Content-Type": MIME_TYPES[path.extname(filePath)] || "application/octet-stream",
      "Content-Length": data.length,
      "Cache-Control": "no-cache",
    });
    if (request.method === "HEAD") {
      response.end();
      return;
    }
    response.end(data);
  });
}

async function handleApi(request, response, urlPathname) {
  if (request.method !== "POST") {
    sendEmpty(response, 405);
    return;
  }

  if (urlPathname === "/api/state/reset") {
    resetState();
    sendEmpty(response);
    return;
  }

  if (urlPathname === "/api/power/press") {
    const body = await parseJsonBody(request);
    pressPower(body.clientId);
    sendEmpty(response);
    return;
  }

  if (urlPathname === "/api/power/release") {
    const body = await parseJsonBody(request);
    releasePower(body.clientId);
    sendEmpty(response);
    return;
  }

  if (urlPathname === "/api/display-mode") {
    const body = await parseJsonBody(request);
    updateState({ displayMode: normalizeDisplayMode(body.displayMode) });
    sendEmpty(response);
    return;
  }

  if (urlPathname === "/api/outline-effect") {
    const body = await parseJsonBody(request);
    updateState({ outlineEffectMode: normalizeOutlineEffectMode(body.outlineEffectMode) });
    sendEmpty(response);
    return;
  }

  if (urlPathname === "/api/game/stop") {
    resetGameState();
    sendEmpty(response);
    return;
  }

  if (urlPathname === "/api/game/start") {
    const body = await parseJsonBody(request);
    startGame(normalizeStartGameBody(body));
    sendEmpty(response);
    return;
  }

  if (urlPathname === "/api/game/spawn") {
    const body = await parseJsonBody(request);
    spawnEnemy(body.start);
    sendEmpty(response);
    return;
  }

  if (urlPathname === "/api/player/left") {
    addPlayerForce(-1);
    sendEmpty(response);
    return;
  }

  if (urlPathname === "/api/player/right") {
    addPlayerForce(1);
    sendEmpty(response);
    return;
  }

  sendJson(response, 404, { error: "Not found" });
}

const server = http.createServer((request, response) => {
  const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);

  if (request.method === "GET" && url.pathname === "/events") {
    handleEvents(request, response, url.searchParams);
    return;
  }

  if (url.pathname.startsWith("/api/")) {
    handleApi(request, response, url.pathname).catch((error) => {
      sendJson(response, 400, { error: error.message });
    });
    return;
  }

  if (request.method !== "GET" && request.method !== "HEAD") {
    sendEmpty(response, 405);
    return;
  }

  serveStatic(request, response, url.pathname);
});

server.listen(PORT, HOST, () => {
  console.log(`LED defense server running at http://${HOST}:${PORT}/`);
  console.log(`Display available at http://${HOST}:${PORT}/display`);
});
