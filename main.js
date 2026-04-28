(function () {
  "use strict";

  const STAGE = Object.freeze({ width: 1600, height: 900, aspect: 16 / 9 });
  const MAX_DEVICE_PIXEL_RATIO = 2;

  const LAYOUT = Object.freeze({
    panel: { x: 48, y: 174, width: 1504, height: 132, chamfer: 28 },
    lane: {
      y: 241,
      inset: 172,
      spacing: 9.6,
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
      outerRadius: 47,
      outerSpacing: 7.2,
      outerDotRadius: 1.65,
      innerRadius: 26,
      innerLineWidth: 4.4,
      laneClearance: 8,
    },
    alerts: [
      { x: 384, count: 4, level: "level2" },
      { x: 566, count: 3, level: "level5" },
      { x: 1034, count: 3, level: "level5" },
      { x: 1244, count: 3, level: "level2" },
    ],
    purpleColumn: { top: 331, rowGap: 28, rows: 18, columns: 9, colGap: 7.5 },
  });

  const STATES = Object.freeze({
    level1: { alpha: 0.16, glow: 0.35 },
    level2: { alpha: 0.34, glow: 0.55 },
    level3: { alpha: 0.55, glow: 0.85 },
    level4: { alpha: 0.78, glow: 1.25 },
    level5: { alpha: 1, glow: 1.95 },
  });

  const COLORS = Object.freeze({
    blue: "#4790ff",
    cyanBlue: "#30a2ff",
    laneOff: "#7f8790",
    red: "#ff433e",
    purple: "#8b32ff",
    violetWhite: "#f0dbff",
  });

  const BIKE_TEMPLATE = Object.freeze({
    width: 62,
    bounds: { minX: -17, minY: -28, maxX: 79, maxY: 39 },
    wheelRadius: 17,
    dotSpacing: 4.3,
    scale: 0.84,
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
      this.state = options.state ?? "level4";
      this.glowColor = options.glowColor ?? this.color;
      this.phase = options.phase ?? 0;
    }

    draw(context, pulse, stateOverride = null) {
      const state = STATES[stateOverride ?? this.state] ?? STATES.level4;
      const shimmer = 0.92 + Math.sin(pulse + this.phase) * 0.08;
      const alpha = state.alpha * shimmer;
      const glow = state.glow * shimmer;

      context.save();
      context.globalCompositeOperation = "lighter";
      context.globalAlpha = alpha * 0.32;
      context.fillStyle = this.glowColor;
      context.shadowColor = this.glowColor;
      context.shadowBlur = this.radius * 5.8 * glow;
      context.beginPath();
      context.arc(this.x, this.y, this.radius * 1.35, 0, Math.PI * 2);
      context.fill();

      context.globalAlpha = alpha;
      context.shadowBlur = this.radius * 2.6 * glow;
      context.fillStyle = this.color;
      context.beginPath();
      context.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
      context.fill();

      context.globalAlpha = Math.min(1, alpha * 0.72);
      context.shadowBlur = 0;
      context.fillStyle = "#ffffff";
      context.beginPath();
      context.arc(this.x - this.radius * 0.22, this.y - this.radius * 0.24, this.radius * 0.28, 0, Math.PI * 2);
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

  class SolidStrokeGraphic {
    constructor(paths = [], options = {}) {
      this.paths = paths;
      this.color = options.color ?? COLORS.blue;
      this.glowColor = options.glowColor ?? this.color;
      this.lineWidth = options.lineWidth ?? 6;
      this.state = options.state ?? "level5";
      this.name = options.name ?? "solid-graphic";
    }

    draw(context, pulse) {
      const state = STATES[this.state] ?? STATES.level4;
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

  function createArrowGraphic(origin, direction = 1) {
    const arm = 22;
    const halfHeight = 24;
    const points = [
      { x: origin.x - direction * arm, y: origin.y - halfHeight },
      { x: origin.x, y: origin.y },
      { x: origin.x - direction * arm, y: origin.y + halfHeight },
    ];
    return new SolidStrokeGraphic([{ type: "polyline", points }], {
      color: COLORS.blue,
      glowColor: COLORS.blue,
      lineWidth: 6,
      state: "level5",
      name: "arrow",
    });
  }

  function bikeTemplateDots() {
    const blue = { color: COLORS.cyanBlue, glowColor: COLORS.blue, radius: 1.85, state: "level5" };
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
    const { bounds, scale } = BIKE_TEMPLATE;
    const origin = {
      x: (bounds.minX + bounds.maxX) / 2,
      y: (bounds.minY + bounds.maxY) / 2,
    };
    const dots = transformDots(baseFactory, { center, origin, scale, mirrored });
    return new LedGraphic(dots, { name: "bicycle", state: "level5" });
  }

  function createTargetGraphic(center) {
    const { outerRadius, outerSpacing, outerDotRadius, innerRadius, innerLineWidth, laneClearance } = LAYOUT.target;
    const redOn = { color: COLORS.red, glowColor: COLORS.red, radius: outerDotRadius, state: "level5" };
    const dots = [
      ...dotsOnCircleOutsideHorizontalBand(center, outerRadius, outerSpacing, laneClearance, redOn),
    ];
    const innerPaths = circleArcPathsOutsideHorizontalBand(center, innerRadius, laneClearance);

    return new DotCollection([
      ...dots,
      new SolidStrokeGraphic(innerPaths, {
        color: COLORS.red,
        glowColor: COLORS.red,
        lineWidth: innerLineWidth,
        state: "level5",
        name: "target-inner",
      }),
    ]);
  }

  function createLaneDots() {
    const { y, inset, spacing, exclusions } = LAYOUT.lane;
    const startX = inset;
    const endX = STAGE.width - inset;
    const length = endX - startX;
    const steps = Math.max(1, Math.round(length / spacing));
    const dots = [];
    const accentRanges = LAYOUT.alerts.map((alert) => {
      const centerIndex = Math.round(((alert.x - startX) / length) * steps);
      const startIndex = centerIndex - Math.floor((alert.count - 1) / 2);
      return {
        startIndex,
        endIndex: startIndex + alert.count - 1,
        level: alert.level,
      };
    });

    for (let index = 0; index <= steps; index += 1) {
      const x = startX + (index / steps) * length;
      if (exclusions.some((range) => Math.abs(x - range.centerX) <= range.radius)) {
        continue;
      }

      const accent = accentRanges.find((range) => index >= range.startIndex && index <= range.endIndex);
      dots.push(dot(x, y, {
        color: accent ? COLORS.red : COLORS.laneOff,
        glowColor: accent ? COLORS.red : COLORS.laneOff,
        radius: accent ? 2.35 : 1.72,
        state: accent ? accent.level : "level2",
        phase: index * 0.08,
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
      const state = row < 3 ? "level3" : "level5";
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
      state: "level5",
    }));

    return new DotCollection(dots);
  }

  function createScene() {
    const scene = new LedScene();
    const blueDots = { color: COLORS.blue, glowColor: COLORS.blue, radius: 1.85, state: "level5" };
    const centerLineY = LAYOUT.lane.y;

    scene.add(new DotCollection(chamferedRectDots(LAYOUT.panel, LAYOUT.panel.chamfer, 9.7, blueDots)));
    scene.add(createLaneDots());

    scene.add(createArrowGraphic({ x: LAYOUT.arrowTipInset, y: centerLineY }, -1));
    scene.add(createArrowGraphic({ x: STAGE.width - LAYOUT.arrowTipInset, y: centerLineY }, 1));
    scene.add(createBikeGraphic({ x: LAYOUT.bikeInset, y: LAYOUT.bikeY }, false));
    scene.add(createBikeGraphic({ x: STAGE.width - LAYOUT.bikeInset, y: LAYOUT.bikeY }, false));

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
