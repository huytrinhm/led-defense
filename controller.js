(function () {
  "use strict";

  const stateTools = window.LedDefenseState;
  const modeSelect = document.getElementById("display-mode");
  const outlineSelect = document.getElementById("outline-effect");
  const gameModeSelect = document.getElementById("game-run-mode");
  const gameTimeInput = document.getElementById("game-time");
  const spawnRateInput = document.getElementById("spawn-rate");
  const startButton = document.getElementById("start-game");
  const resetButton = document.getElementById("reset-state");
  const leftButton = document.getElementById("move-left");
  const rightButton = document.getElementById("move-right");
  const chargeButton = document.getElementById("charge-power");
  const spawnButton = document.getElementById("spawn-enemy");
  const stopButton = document.getElementById("stop-game");
  const clientId = createClientId();
  let charging = false;

  if (
    !stateTools
    || !modeSelect
    || !outlineSelect
    || !gameModeSelect
    || !gameTimeInput
    || !spawnRateInput
    || !startButton
    || !resetButton
    || !leftButton
    || !rightButton
    || !chargeButton
    || !spawnButton
    || !stopButton
  ) {
    return;
  }

  function createClientId() {
    if (window.crypto?.randomUUID) {
      return window.crypto.randomUUID();
    }
    return `controller-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function postJson(url, payload, options = {}) {
    return fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      keepalive: Boolean(options.keepalive),
    });
  }

  function pressPower() {
    if (charging) {
      return;
    }
    charging = true;
    chargeButton.classList.add("is-active");
    chargeButton.setAttribute("aria-pressed", "true");
    postJson("/api/power/press", { clientId }).catch((error) => {
      console.error("Unable to charge power", error);
    });
  }

  function releasePower(options = {}) {
    if (!charging) {
      return;
    }
    charging = false;
    chargeButton.classList.remove("is-active");
    chargeButton.setAttribute("aria-pressed", "false");
    postJson("/api/power/release", { clientId }, options).catch((error) => {
      if (!options.keepalive) {
        console.error("Unable to release power", error);
      }
    });
  }

  function releasePowerOnKey(event) {
    if (event.key === " " || event.key === "Enter") {
      event.preventDefault();
      releasePower();
    }
  }

  modeSelect.value = stateTools.DEFAULT_STATE.displayMode;
  outlineSelect.value = stateTools.DEFAULT_STATE.outlineEffectMode;
  gameModeSelect.value = stateTools.GAME_AUTOMATION.defaultMode;
  gameTimeInput.value = String(stateTools.GAME_AUTOMATION.defaultDurationMs / 1000);
  spawnRateInput.value = String(stateTools.GAME_AUTOMATION.defaultSpawnIntervalMs / 1000);

  function resetControlValues() {
    modeSelect.value = stateTools.DEFAULT_STATE.displayMode;
    outlineSelect.value = stateTools.DEFAULT_STATE.outlineEffectMode;
    gameModeSelect.value = stateTools.GAME_AUTOMATION.defaultMode;
    gameTimeInput.value = String(stateTools.GAME_AUTOMATION.defaultDurationMs / 1000);
    spawnRateInput.value = String(stateTools.GAME_AUTOMATION.defaultSpawnIntervalMs / 1000);
  }

  function startGame() {
    releasePower();
    postJson("/api/game/start", {
      durationSeconds: Number(gameTimeInput.value),
      mode: gameModeSelect.value,
      spawnIntervalSeconds: Number(spawnRateInput.value),
    }).catch((error) => {
      console.error("Unable to start game", error);
    });
  }

  resetButton.addEventListener("click", () => {
    releasePower();
    resetControlValues();
    postJson("/api/state/reset", {}).catch((error) => {
      console.error("Unable to reset display state", error);
    });
  });

  modeSelect.addEventListener("change", () => {
    postJson("/api/display-mode", { displayMode: modeSelect.value }).catch((error) => {
      console.error("Unable to update display mode", error);
    });
  });

  outlineSelect.addEventListener("change", () => {
    postJson("/api/outline-effect", { outlineEffectMode: outlineSelect.value }).catch((error) => {
      console.error("Unable to update outline effect", error);
    });
  });

  leftButton.addEventListener("click", () => {
    postJson("/api/player/left", {}).catch((error) => {
      console.error("Unable to move left", error);
    });
  });

  rightButton.addEventListener("click", () => {
    postJson("/api/player/right", {}).catch((error) => {
      console.error("Unable to move right", error);
    });
  });

  startButton.addEventListener("click", startGame);

  chargeButton.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    chargeButton.setPointerCapture(event.pointerId);
    pressPower();
  });

  chargeButton.addEventListener("pointerup", (event) => {
    event.preventDefault();
    if (chargeButton.hasPointerCapture(event.pointerId)) {
      chargeButton.releasePointerCapture(event.pointerId);
    }
    releasePower();
  });

  chargeButton.addEventListener("pointercancel", releasePower);
  chargeButton.addEventListener("lostpointercapture", releasePower);
  chargeButton.addEventListener("keydown", (event) => {
    if (event.key === " " || event.key === "Enter") {
      event.preventDefault();
      pressPower();
    }
  });
  chargeButton.addEventListener("keyup", releasePowerOnKey);

  spawnButton.addEventListener("click", () => {
    postJson("/api/game/spawn", {}).catch((error) => {
      console.error("Unable to spawn enemy", error);
    });
  });

  stopButton.addEventListener("click", () => {
    releasePower();
    resetControlValues();
    postJson("/api/game/stop", {}).catch((error) => {
      console.error("Unable to stop game", error);
    });
  });

  window.addEventListener("blur", releasePower);
  window.addEventListener("beforeunload", () => {
    releasePower({ keepalive: true });
  });
})();
