"use strict";

const fs = require("fs");
const http = require("http");
const path = require("path");
const {
  DEFAULT_STATE,
  GAME,
  POWER,
  clampPlayerStart,
  clampPowerLevel,
  normalizeDisplayMode,
  normalizeInputForces,
  normalizeState,
} = require("./state");

const PORT = Number(process.env.PORT || 4173);
const ROOT = __dirname;
const ROOT_PREFIX = `${ROOT}${path.sep}`;
const clients = new Set();
let state = normalizeState(DEFAULT_STATE);
let tickTimer = null;
let movementTimer = null;
let powerTimer = null;
const gameOverAnimationTimers = new Set();
let nextEnemyId = 1;
let playerForces = { left: 0, right: 0 };
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

function sendState(response) {
  response.write(`data: ${JSON.stringify(state)}\n\n`);
}

function broadcastState() {
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
}

function stopPowerTimer() {
  if (powerTimer) {
    clearTimeout(powerTimer);
    powerTimer = null;
  }
}

function stopGameOverAnimationTimers() {
  for (const timer of gameOverAnimationTimers) {
    clearTimeout(timer);
  }
  gameOverAnimationTimers.clear();
}

function resetPlayerForces() {
  playerForces = { left: 0, right: 0 };
  stopMovementTimer();
}

function resetPowerInput() {
  chargingClients.clear();
  stopPowerTimer();
}

function publishPlayerForces() {
  updateState({ inputForces: normalizeInputForces(playerForces) });
}

function setState(nextState) {
  state = normalizeState(nextState);
  broadcastState();
}

function resetState() {
  stopGameOverAnimationTimers();
  stopTick();
  resetPlayerForces();
  resetPowerInput();
  nextEnemyId = 1;
  setState(DEFAULT_STATE);
}

function updateState(patch) {
  setState({ ...state, ...patch });
}

function tickGame() {
  if (state.gameOver) {
    stopTick();
    return;
  }

  if (state.enemies.some((enemy) => enemy.distance <= 1)) {
    triggerGameOver();
    return;
  }

  const enemies = state.enemies
    .map((enemy) => ({ ...enemy, distance: enemy.distance - 1 }))
    .filter((enemy) => enemy.distance > 0);

  if (enemies.length === 0) {
    stopTick();
  }

  setState({ ...state, enemies, running: enemies.length > 0 });
}

function triggerGameOver() {
  stopTick();
  resetPlayerForces();
  resetPowerInput();
  const gameOverStartedAt = Date.now();
  setState({
    ...state,
    inputForces: playerForces,
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
    resetState();
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

function overlapsEnemy(start, enemy) {
  const end = start + GAME.enemyWidth - 1;
  const enemyEnd = enemy.start + GAME.enemyWidth - 1;
  return start <= enemyEnd + GAME.enemyGap && end >= enemy.start - GAME.enemyGap;
}

function enemyOverlapsPlayer(enemy) {
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

function spawnEnemy(requestedStartValue) {
  if (state.gameOver) {
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
  setState({ ...state, enemies, running: true });
  startTick();
  return true;
}

function shootPower() {
  if (state.gameOver) {
    resetPowerInput();
    return;
  }

  resetPowerInput();
  const enemies = state.enemies.filter((enemy) => !enemyOverlapsPlayer(enemy));
  updateState({
    enemies,
    powerLevel: 0,
    running: enemies.length > 0,
  });
  if (enemies.length === 0) {
    stopTick();
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

function tickPower() {
  powerTimer = null;

  if (state.gameOver) {
    resetPowerInput();
    return;
  }

  if (chargingClients.size > 0) {
    if (state.powerLevel < POWER.maxLevel) {
      updateState({ powerLevel: clampPowerLevel(state.powerLevel + 1) });
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
    shootPower();
    return;
  }

  chargingClients.add(normalizeClientId(clientIdValue));
  stopPowerTimer();
  schedulePowerTimer();
}

function releasePower(clientIdValue) {
  if (state.gameOver) {
    resetPowerInput();
    return;
  }

  chargingClients.delete(normalizeClientId(clientIdValue));
  stopPowerTimer();
  schedulePowerTimer();
}

function nextPlayerStart(delta) {
  const nextPlayerStart = clampPlayerStart(state.playerStart + delta);
  return nextPlayerStart;
}

function resolvePlayerForces() {
  const { left, right } = playerForces;
  playerForces = { left: 0, right: 0 };
  stopMovementTimer();

  if (left + right === 0) {
    publishPlayerForces();
    return;
  }

  const netForce = right - left;
  if (netForce === 0) {
    updateState({ inputForces: playerForces });
    return;
  }

  const magnitude = Math.min(GAME.maxPlayerMovePerTick, Math.max(1, Math.abs(netForce)));
  updateState({
    inputForces: playerForces,
    playerStart: nextPlayerStart(Math.sign(netForce) * magnitude),
  });
}

function startMovementTimer() {
  if (!movementTimer) {
    movementTimer = setInterval(resolvePlayerForces, GAME.movementTickMs);
  }
}

function addPlayerForce(direction) {
  if (state.gameOver) {
    return;
  }

  if (direction < 0) {
    playerForces.left += 1;
  } else {
    playerForces.right += 1;
  }
  publishPlayerForces();
  startMovementTimer();
}

function handleEvents(request, response) {
  response.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  response.write(": connected\n\n");
  sendState(response);
  clients.add(response);

  const cleanup = () => {
    clients.delete(response);
  };
  request.on("close", cleanup);
  response.on("error", cleanup);
}

function resolveStaticPath(urlPathname) {
  const routePath = urlPathname === "/" ? "/controller.html" : urlPathname;
  const displayRoutePath = routePath === "/display" ? "/index.html" : routePath;
  const normalizedPath = path.normalize(displayRoutePath).replace(/^([/\\])/, "");
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

  if (urlPathname === "/api/game/stop") {
    resetState();
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
    handleEvents(request, response);
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

server.listen(PORT, () => {
  console.log(`LED defense server running at http://127.0.0.1:${PORT}/`);
  console.log(`Display available at http://127.0.0.1:${PORT}/display`);
});
