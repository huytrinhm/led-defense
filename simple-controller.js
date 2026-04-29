(function () {
  "use strict";

  const leftButton = document.getElementById("move-left");
  const rightButton = document.getElementById("move-right");
  const chargeButton = document.getElementById("charge-power");
  const clientId = createClientId();
  let charging = false;

  if (!leftButton || !rightButton || !chargeButton) {
    return;
  }

  function syncVisibleHeight() {
    const height = window.visualViewport?.height ?? window.innerHeight;
    document.documentElement.style.setProperty("--visible-height", `${Math.round(height)}px`);
  }

  function createClientId() {
    if (window.crypto?.randomUUID) {
      return window.crypto.randomUUID();
    }
    return `simple-controller-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function postJson(url, payload, options = {}) {
    return fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      keepalive: Boolean(options.keepalive),
    });
  }

  function sendTap(url, button) {
    button.classList.add("is-active");
    window.setTimeout(() => {
      button.classList.remove("is-active");
    }, 120);
    postJson(url, {}).catch((error) => {
      console.error("Unable to send control input", error);
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

  leftButton.addEventListener("click", () => {
    sendTap("/api/player/left", leftButton);
  });

  rightButton.addEventListener("click", () => {
    sendTap("/api/player/right", rightButton);
  });

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
  chargeButton.addEventListener("keyup", (event) => {
    if (event.key === " " || event.key === "Enter") {
      event.preventDefault();
      releasePower();
    }
  });

  window.addEventListener("blur", releasePower);
  window.addEventListener("resize", syncVisibleHeight);
  window.visualViewport?.addEventListener("resize", syncVisibleHeight);
  window.visualViewport?.addEventListener("scroll", syncVisibleHeight);
  window.addEventListener("beforeunload", () => {
    releasePower({ keepalive: true });
  });
  syncVisibleHeight();
})();
