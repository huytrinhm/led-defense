(function (root) {
  "use strict";

  const MOVE_REPEAT_INITIAL_MS = 220;
  const MOVE_REPEAT_MS = 90;

  function createMoveHold(button, sendMove) {
    let activePointerId = null;
    let initialTimer = null;
    let repeatTimer = null;
    let keyboardActive = false;

    function stop() {
      if (initialTimer) {
        window.clearTimeout(initialTimer);
        initialTimer = null;
      }
      if (repeatTimer) {
        window.clearInterval(repeatTimer);
        repeatTimer = null;
      }
      activePointerId = null;
      keyboardActive = false;
      button.classList.remove("is-active");
    }

    function start() {
      stop();
      button.classList.add("is-active");
      sendMove();
      initialTimer = window.setTimeout(() => {
        initialTimer = null;
        repeatTimer = window.setInterval(sendMove, MOVE_REPEAT_MS);
      }, MOVE_REPEAT_INITIAL_MS);
    }

    button.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      activePointerId = event.pointerId;
      button.setPointerCapture(event.pointerId);
      start();
    });
    button.addEventListener("pointerup", (event) => {
      event.preventDefault();
      if (activePointerId === event.pointerId && button.hasPointerCapture(event.pointerId)) {
        button.releasePointerCapture(event.pointerId);
      }
      stop();
    });
    button.addEventListener("pointercancel", stop);
    button.addEventListener("lostpointercapture", stop);
    button.addEventListener("click", (event) => {
      event.preventDefault();
    });
    button.addEventListener("keydown", (event) => {
      if ((event.key === " " || event.key === "Enter") && !keyboardActive) {
        event.preventDefault();
        keyboardActive = true;
        start();
      }
    });
    button.addEventListener("keyup", (event) => {
      if (event.key === " " || event.key === "Enter") {
        event.preventDefault();
        stop();
      }
    });

    return { stop };
  }

  root.LedDefenseControls = Object.freeze({
    createMoveHold,
  });
}(window));
