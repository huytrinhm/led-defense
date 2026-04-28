(function () {
  "use strict";

  const STAGE = Object.freeze({ width: 1600, height: 900, aspect: 16 / 9 });
  const MAX_DEVICE_PIXEL_RATIO = 2;

  const LAYOUT = Object.freeze({
    panel: { x: 48, y: 178, width: 1504, height: 132, chamfer: 28 },
    laneY: 244,
    laneInset: 172,
    arrowTipInset: 76,
    bikeInset: 158,
    bikeY: 222,
    targetCenterX: STAGE.width / 2,
    target: { outerRadius: 47, innerRadius: 26, innerMode: "circle" },
    alerts: [
      { x: 384, count: 4, spacing: 12, state: "dim" },
      { x: 566, count: 3, spacing: 15, state: "hot" },
      { x: 1034, count: 3, spacing: 15, state: "hot" },
      { x: 1244, count: 3, spacing: 13, state: "dim" },
    ],
    purpleColumn: { top: 326, rowGap: 28, rows: 18, columns: 9, colGap: 7.5 },
  });

  const STATES = Object.freeze({
    off: { alpha: 0.16, glow: 0.4 },
    dim: { alpha: 0.56, glow: 0.9 },
    on: { alpha: 1, glow: 1.7 },
    hot: { alpha: 1, glow: 2.7 },
  });

  const COLORS = Object.freeze({
    blue: "#4790ff",
    cyanBlue: "#30a2ff",
    red: "#ff433e",
    purple: "#8b32ff",
    violetWhite: "#f0dbff",
  });

  const BIKE_TEMPLATE = Object.freeze({
    width: 62,
    wheelRadius: 17,
    dotSpacing: 4.3,
  });

  const canvas = document.getElementById("led-canvas");
  const ctx = canvas.getContext("2d", { alpha: false });

  if (!ctx) {
    return;
  }

  class LedDot {
    constructor(x, y, options = {}) {
      this.x = x;
      this.y = y;
      this.radius = options.radius ?? 2.15;
      this.color = options.color ?? COLORS.blue;
      this.state = options.state ?? "on";
      this.glowColor = options.glowColor ?? this.color;
      this.phase = options.phase ?? 0;
    }

    draw(context, pulse, stateOverride = null) {
      const state = STATES[stateOverride ?? this.state] ?? STATES.on;
      const shimmer = 0.92 + Math.sin(pulse + this.phase) * 0.08;
      const alpha = state.alpha * shimmer;
      const glow = state.glow * shimmer;

      context.save();
      context.globalCompositeOperation = "lighter";
      context.globalAlpha = alpha * 0.45;
      context.fillStyle = this.glowColor;
      context.shadowColor = this.glowColor;
      context.shadowBlur = this.radius * 7.5 * glow;
      context.beginPath();
      context.arc(this.x, this.y, this.radius * 1.55, 0, Math.PI * 2);
      context.fill();

      context.globalAlpha = alpha;
      context.shadowBlur = this.radius * 3.5 * glow;
      context.fillStyle = this.color;
      context.beginPath();
      context.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
      context.fill();

      context.globalAlpha = Math.min(1, alpha * 0.9);
      context.shadowBlur = 0;
      context.fillStyle = "#ffffff";
      context.beginPath();
      context.arc(this.x - this.radius * 0.22, this.y - this.radius * 0.24, this.radius * 0.34, 0, Math.PI * 2);
      context.fill();
      context.restore();
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

    draw(context, pulse) {
      for (const dot of this.dots) {
        dot.draw(context, pulse);
      }
    }
  }

  class LedGraphic extends DotCollection {
    constructor(dots = [], options = {}) {
      super(dots);
      this.name = options.name ?? "graphic";
      this.state = options.state ?? null;
    }

    draw(context, pulse) {
      for (const dot of this.dots) {
        dot.draw(context, pulse, this.state);
      }
    }
  }

  class LedScene {
    constructor() {
      this.layers = [];
    }

    add(layer) {
      this.layers.push(layer);
      return layer;
    }

    draw(context, pulse) {
      drawBackground(context);
      for (const layer of this.layers) {
        layer.draw(context, pulse);
      }
    }
  }

  function dot(x, y, options) {
    return new LedDot(x, y, options);
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
      { x: x + chamfer, y },
    ];
    return dotsOnPolyline(points, spacing, options);
  }

  function translatedDots(factory, dx, dy) {
    return factory().map((item) => cloneDot(item, item.x + dx, item.y + dy));
  }

  function mirroredDots(factory, mirrorX, dx, dy) {
    return factory().map((item) => cloneDot(item, mirrorX - item.x + dx, item.y + dy));
  }

  function createArrowGraphic(origin, direction = 1) {
    const arm = 24;
    const halfHeight = 22;
    const pts = [
      { x: origin.x - direction * arm, y: origin.y - halfHeight },
      { x: origin.x, y: origin.y },
      { x: origin.x - direction * arm, y: origin.y + halfHeight },
    ];
    return new LedGraphic(dotsOnPolyline(pts, 5.4, {
      color: COLORS.blue,
      glowColor: COLORS.blue,
      radius: 2.05,
      state: "hot",
    }), { name: "arrow", state: "hot" });
  }

  function bikeTemplateDots() {
    const blue = { color: COLORS.cyanBlue, glowColor: COLORS.blue, radius: 1.85, state: "hot" };
    const { width, wheelRadius, dotSpacing } = BIKE_TEMPLATE;
    const dots = [];
    dots.push(...dotsOnCircle({ x: 0, y: 22 }, wheelRadius, 4.2, blue));
    dots.push(...dotsOnCircle({ x: width, y: 22 }, wheelRadius, 4.2, blue));
    dots.push(...dotsOnPolyline([
      { x: 0, y: 22 },
      { x: 25, y: -4 },
      { x: 43, y: 22 },
      { x: 0, y: 22 },
      { x: 22, y: 22 },
      { x: 36, y: -4 },
      { x: 25, y: -4 },
    ], dotSpacing, blue));
    dots.push(...dotsOnPolyline([
      { x: 36, y: -4 },
      { x: 55, y: -4 },
      { x: width, y: 22 },
    ], dotSpacing, blue));
    dots.push(...dotsOnPolyline([
      { x: 25, y: -4 },
      { x: 20, y: -20 },
      { x: 10, y: -20 },
    ], 4.5, blue));
    dots.push(...dotsOnPolyline([
      { x: 55, y: -4 },
      { x: 54, y: -22 },
      { x: 43, y: -22 },
    ], 4.5, blue));
    dots.push(...dotsOnLine({ x: 11, y: -26 }, { x: 25, y: -26 }, 4.5, blue));
    dots.push(...dotsOnLine({ x: 44, y: -28 }, { x: 57, y: -28 }, 4.5, blue));
    return dots;
  }

  function createBikeGraphic(center, mirrored = false) {
    const baseFactory = bikeTemplateDots;
    const halfWidth = BIKE_TEMPLATE.width / 2;
    const dots = mirrored
      ? mirroredDots(baseFactory, halfWidth, center.x - halfWidth, center.y)
      : translatedDots(baseFactory, center.x - halfWidth, center.y);
    return new LedGraphic(dots, { name: "bicycle", state: "hot" });
  }

  function createTargetGraphic(center) {
    const redHot = { color: COLORS.red, glowColor: COLORS.red, radius: 2.15, state: "hot" };
    const redOn = { color: COLORS.red, glowColor: COLORS.red, radius: 2.05, state: "on" };
    const { outerRadius, innerRadius, innerMode } = LAYOUT.target;
    const dots = [
      ...dotsOnCircle(center, outerRadius, 6.1, redOn),
    ];

    if (innerMode === "circle") {
      dots.push(...dotsOnCircle(center, innerRadius, 5.2, redHot));
    } else {
      dots.push(
        ...dotsOnArc(center, innerRadius, Math.PI * 1.08, Math.PI * 1.92, 5.2, redHot),
        ...dotsOnArc(center, innerRadius, Math.PI * 0.08, Math.PI * 0.92, 5.2, redHot)
      );
    }

    return new LedGraphic(dots, { name: "target" });
  }

  function createAlertCluster(center, count, spacing, state = "hot") {
    const dots = [];
    const first = center.x - ((count - 1) * spacing) / 2;
    for (let i = 0; i < count; i += 1) {
      dots.push(dot(first + i * spacing, center.y, {
        color: COLORS.red,
        glowColor: COLORS.red,
        radius: state === "hot" ? 3.1 : 2.2,
        state,
        phase: i * 0.35,
      }));
    }
    return new DotCollection(dots);
  }

  function createPurpleColumn() {
    const dots = [];
    const x = LAYOUT.targetCenterX;
    const { top, rowGap, rows, columns, colGap } = LAYOUT.purpleColumn;
    const halfWidth = ((columns - 1) * colGap) / 2;

    for (let row = 0; row < rows; row += 1) {
      const y = top + row * rowGap;
      const state = row < 3 ? "dim" : "hot";
      const color = row < 3 ? COLORS.purple : COLORS.violetWhite;
      for (let col = 0; col < columns; col += 1) {
        dots.push(dot(x - halfWidth + col * colGap, y, {
          color,
          glowColor: COLORS.purple,
          radius: row < 3 ? 2.25 : 2.55,
          state,
          phase: row * 0.2 + col * 0.1,
        }));
      }
    }

    dots.push(dot(x, top + rows * rowGap + 4, {
      color: COLORS.violetWhite,
      glowColor: COLORS.purple,
      radius: 5,
      state: "hot",
    }));

    return new DotCollection(dots);
  }

  function createScene() {
    const scene = new LedScene();
    const blueDots = { color: COLORS.blue, glowColor: COLORS.blue, radius: 1.85, state: "hot" };
    const centerLineY = LAYOUT.laneY;

    scene.add(new DotCollection(chamferedRectDots(LAYOUT.panel, LAYOUT.panel.chamfer, 9.7, blueDots)));
    scene.add(new DotCollection(dotsOnLine(
      { x: LAYOUT.laneInset, y: centerLineY },
      { x: STAGE.width - LAYOUT.laneInset, y: centerLineY },
      9.6,
      {
        ...blueDots,
        radius: 1.72,
        state: "on",
      }
    )));

    scene.add(createArrowGraphic({ x: LAYOUT.arrowTipInset, y: centerLineY }, -1));
    scene.add(createArrowGraphic({ x: STAGE.width - LAYOUT.arrowTipInset, y: centerLineY }, 1));
    scene.add(createBikeGraphic({ x: LAYOUT.bikeInset, y: LAYOUT.bikeY }, false));
    scene.add(createBikeGraphic({ x: STAGE.width - LAYOUT.bikeInset, y: LAYOUT.bikeY }, true));

    for (const alert of LAYOUT.alerts) {
      scene.add(createAlertCluster(
        { x: alert.x, y: centerLineY },
        alert.count,
        alert.spacing,
        alert.state
      ));
    }

    scene.add(createTargetGraphic({ x: LAYOUT.targetCenterX, y: centerLineY }));
    scene.add(createPurpleColumn());

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

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, MAX_DEVICE_PIXEL_RATIO);
    canvas.width = Math.round(window.innerWidth * dpr);
    canvas.height = Math.round(window.innerHeight * dpr);
    canvas.style.width = `${window.innerWidth}px`;
    canvas.style.height = `${window.innerHeight}px`;
  }

  function withLetterboxedStage(context, render) {
    const viewportWidth = canvas.width;
    const viewportHeight = canvas.height;
    const viewportAspect = viewportWidth / viewportHeight;
    const scale = viewportAspect > STAGE.aspect
      ? viewportHeight / STAGE.height
      : viewportWidth / STAGE.width;
    const stageWidth = STAGE.width * scale;
    const stageHeight = STAGE.height * scale;
    const offsetX = (viewportWidth - stageWidth) / 2;
    const offsetY = (viewportHeight - stageHeight) / 2;

    context.save();
    context.clearRect(0, 0, viewportWidth, viewportHeight);
    context.fillStyle = "#000";
    context.fillRect(0, 0, viewportWidth, viewportHeight);
    context.translate(offsetX, offsetY);
    context.scale(scale, scale);
    render();
    context.restore();
  }

  const scene = createScene();

  function frame(now) {
    withLetterboxedStage(ctx, () => {
      scene.draw(ctx, now / 620);
    });
    requestAnimationFrame(frame);
  }

  window.addEventListener("resize", resize);
  resize();
  requestAnimationFrame(frame);
})();
