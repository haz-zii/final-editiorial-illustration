// === Side Tool Scroll Control ===
let sideToolVisible = false;
let firstParagraphElement = null;
let lastParagraphElement = null;

// === Navbar Scroll Control ===
let lastScrollY = 0;

function initSideTool() {
    const sideTool = document.getElementById('sideTool');
    const heroSection = document.querySelector('.hero');
    const articleScreenshots = document.querySelectorAll('.article-screenshot');
    
    if (articleScreenshots.length > 0) {
        firstParagraphElement = articleScreenshots[0];
        lastParagraphElement = articleScreenshots[articleScreenshots.length - 1];
    }
    
    window.addEventListener('scroll', () => {
        if (!firstParagraphElement || !lastParagraphElement || !heroSection) return;
        
        const scrollTop = window.pageYOffset;
        const heroBottom = heroSection.offsetTop + heroSection.offsetHeight;
        const firstParagraphTop = firstParagraphElement.offsetTop;
        const lastParagraphBottom = lastParagraphElement.offsetTop + lastParagraphElement.offsetHeight;
        const windowHeight = window.innerHeight;
        
        // Show side tool only after hero section and when first paragraph is in view, hide when last paragraph is out of view
        const shouldShow = scrollTop > heroBottom && scrollTop + windowHeight > firstParagraphTop && scrollTop < lastParagraphBottom;
        
        if (shouldShow && !sideToolVisible) {
            sideTool.classList.add('visible');
            sideToolVisible = true;
        } else if (!shouldShow && sideToolVisible) {
            sideTool.classList.remove('visible');
            sideToolVisible = false;
        }
    });
}

// Initialize side tool when DOM is loaded
document.addEventListener('DOMContentLoaded', initSideTool);

// Initialize navbar to be visible on page load
document.addEventListener('DOMContentLoaded', function() {
    const navbar = document.querySelector('.navbar');
    if (navbar) {
        navbar.classList.add('visible');
        // Initialize lastScrollY to current scroll position
        lastScrollY = window.pageYOffset || document.documentElement.scrollTop;
    }
});

// === Human Design Eyes (Lag-free): Grid → Zoom → Vignette → Type-Specific Effect → Remove ===
// Blur removed (caused lag + white ring). Now: crisp focus eye + fast gradient vignette.
// Effects are fixed per type: Manifestor→burn, Man-Gen→run, Generator→explode, Projector→break, Reflector→melt.

// --------------------------------------------------------------------------
// GLOBALS
let eyes = [];
let eyeScale = 0.75;

// Camera + state
const STATE = { OVERVIEW:0, ZOOM_IN:1, ACTION:2, ZOOM_OUT:3 };
let app = {
  state: STATE.OVERVIEW,
  focusedIndex: -1,
  cam: { x:0, y:0, s:1, tx:0, ty:0, ts:1, ease:0.16 },
  effect: null,               // { kind, t, dur, data }
  removeAfter: -1,
  vignetteStrength: 0.55,     // 0..1 darkness at edges
};

// Fixed mapping from energy types -> effects
const DURS = { run:1400, explode:1200, melt:1800, break:1500, burn:1800 };
const EFFECT_BY_TYPE = {
  "MANIFESTOR": "burn",
  "MANIFESTING GENERATOR": "run",
  "GENERATOR": "explode",
  "PROJECTOR": "break",
  "REFLECTOR": "melt"
};

// --------------------------------------------------------------------------
// SETUP
function setup() {
  let canvas = createCanvas(windowWidth, windowHeight);
  canvas.parent('p5-hero');
  angleMode(RADIANS);
  textAlign(CENTER, CENTER);
  noStroke();
  colorMode(RGB, 255, 255, 255, 255);
  textFont("Inter, helvetica, sans-serif");
  
  // Create one instance of each eye type (your phrases kept)
  eyes.push(new Eye1_Grid("PROJECTOR"));
  eyes.push(new Eye2_Fraser("REFLECTOR"));
  eyes.push(new Eye3_Ribbons("MANIFESTOR"));
  eyes.push(new Eye4_Generator("GENERATOR"));
  eyes.push(new Eye5_ManGen("MANIFESTING GENERATOR"));
  noSmooth();
  toOverviewImmediate();
}

function windowResized() {
  // If you want responsive canvas, uncomment:
  // resizeCanvas(windowWidth, windowHeight);
  toOverviewImmediate();
}

// --------------------------------------------------------------------------
// DRAW
function draw() {
  background(0);

  // Smooth camera
  const c = app.cam;
  c.x = lerp(c.x, c.tx, c.ease);
  c.y = lerp(c.y, c.ty, c.ease);
  c.s = lerp(c.s, c.ts, c.ease);

  const positions = getGridPositions(eyes.length);

  if (app.state === STATE.OVERVIEW || app.state === STATE.ZOOM_OUT) {
    // WORLD: draw all eyes
    push();
    translate(width/2, height/2); scale(c.s); translate(-c.x, -c.y);
    for (let i = 0; i < eyes.length; i++) {
      const p = positions[i];
      eyes[i].drawAt(p.x, p.y, eyeScale);
    }
    pop();
  } else {
    // ZOOM_IN / ACTION: draw only the focused eye (neighbors omitted for speed)
    const fi = app.focusedIndex;
    const fp = positions[fi];

    // Focused eye
    push();
    translate(width/2, height/2); scale(c.s); translate(-c.x, -c.y);
    if (app.state === STATE.ZOOM_IN) {
      eyes[fi].drawAt(fp.x, fp.y, eyeScale);
    } else if (app.state === STATE.ACTION && app.effect) {
      // Secondary effect draws the eye as needed
      push();
      translate(fp.x, fp.y);
      const done = runSecondaryEffect(eyes[fi], {x:0,y:0}, app.effect); // local origin
      pop();
      if (done) {
        app.removeAfter = fi;
        startZoomOutFrom(fp, positions);
      }
    }
    pop();

    // Screen-space vignette (fast gradient, no erasing/white ring)
    drawVignette(positions[fi]);
  }

  // Transition into ACTION once zoom-in has arrived
  if (app.state === STATE.ZOOM_IN &&
      near(app.cam.x, app.cam.tx, 0.6) &&
      near(app.cam.y, app.cam.ty, 0.6) &&
      near(app.cam.s, app.cam.ts, 0.004)) {
    app.state = STATE.ACTION;
  }

  // When zoom-out finishes, remove the eye and reframe
  if (app.state === STATE.ZOOM_OUT &&
      near(app.cam.s, app.cam.ts, 0.002) &&
      near(app.cam.x, app.cam.tx, 0.5) &&
      near(app.cam.y, app.cam.ty, 0.5)) {
    app.state = STATE.OVERVIEW;
    if (app.removeAfter >= 0 && app.removeAfter < eyes.length) {
      eyes.splice(app.removeAfter, 1);
      app.removeAfter = -1;
      toOverviewImmediate();
    }
  }

  // End screen
  if (eyes.length === 0) {
    noStroke(); fill(255); textAlign(CENTER, CENTER);
    textSize(18);
    text("All energies discharged. Scroll to read the article or refresh to replay.", width/2, height/2);
  }
}


// --------------------------------------------------------------------------
// INPUT
function mousePressed() {
  if (app.state !== STATE.OVERVIEW) return;

  const positions = getGridPositions(eyes.length);
  const world = screenToWorld(mouseX, mouseY);
  const mx = world.x, my = world.y;

  for (let i = 0; i < eyes.length; i++) {
    const p = positions[i];
    const baseW = 240 * eyeScale;
    const baseH = baseW * 0.52;
    const dx = mx - p.x, dy = my - p.y;
    const h = (dx*dx) / sq(baseW/2) + (dy*dy) / sq(baseH/2);
    if (h <= 1) {
      app.focusedIndex = i;
      startZoomInTo(p);
      selectEffectFor(i);
      return;
    }
  }
}

// --------------------------------------------------------------------------
// CAMERA HELPERS
function toOverviewImmediate() {
  const bbox = worldBBox();
  const fit = fitToScreen(bbox, 0.12);
  app.cam.x = app.cam.tx = fit.cx;
  app.cam.y = app.cam.ty = fit.cy;
  app.cam.s = app.cam.ts = fit.scale;
  app.state = STATE.OVERVIEW;
}

function startZoomInTo(p) {
  const targetScreenEyeW = min(width, height) * 0.36;
  const worldEyeW = 240 * eyeScale;
  const targetScale = targetScreenEyeW / worldEyeW;
  app.cam.tx = p.x; app.cam.ty = p.y; app.cam.ts = targetScale;
  app.state = STATE.ZOOM_IN;
}

function startZoomOutFrom(p, positions) {
  const fit = worldBBox();
  const res = fitToScreen(fit, 0.12);
  app.cam.tx = res.cx; app.cam.ty = res.cy; app.cam.ts = res.scale;
  app.state = STATE.ZOOM_OUT;
}

function worldBBox() {
  const positions = getGridPositions(eyes.length);
  if (positions.length === 0) return { minx:0, miny:0, maxx:0, maxy:0, cx:0, cy:0 };
  let minx = +Infinity, miny = +Infinity, maxx = -Infinity, maxy = -Infinity;
  const w = 240 * eyeScale, h = w * 0.52;
  for (const p of positions) {
    minx = min(minx, p.x - w/1.8);
    maxx = max(maxx, p.x + w/1.8);
    miny = min(miny, p.y - h/1.6);
    maxy = max(maxy, p.y + h/1.6);
  }
  return { minx, miny, maxx, maxy, cx:(minx+maxx)/2, cy:(miny+maxy)/2 };
}

function fitToScreen(bbox, padFrac=0.12) {
  const w = max(1, bbox.maxx - bbox.minx);
  const h = max(1, bbox.maxy - bbox.miny);
  const padW = w * padFrac, padH = h * padFrac;
  const scaleX = width / (w + padW*2);
  const scaleY = height / (h + padH*2);
  const scale = min(scaleX, scaleY);
  return { cx:bbox.cx, cy:bbox.cy, scale };
}

function screenToWorld(sx, sy) {
  const c = app.cam;
  const wx = (sx - width/2) / c.s + c.x;
  const wy = (sy - height/2) / c.s + c.y;
  return { x: wx, y: wy };
}

function near(a, b, eps) { return abs(a-b) < eps; }

// --------------------------------------------------------------------------
// LAYOUT (3 on row 1, 2 on row 2)
function getGridPositions(n) {
  const pos = [];
  if (n >= 1) pos.push({ x: width * 0.25, y: height * 0.33 });
  if (n >= 2) pos.push({ x: width * 0.50, y: height * 0.33 });
  if (n >= 3) pos.push({ x: width * 0.75, y: height * 0.33 });
  if (n >= 4) pos.push({ x: width * 0.37, y: height * 0.66 });
  if (n >= 5) pos.push({ x: width * 0.63, y: height * 0.66 });
  return pos.slice(0, n);
}

// --------------------------------------------------------------------------
// VIGNETTE (fast canvas radial gradient — no erase, no rings, no lag)
function drawVignette(focusWorldPos) {
  const c = app.cam;
  const fx = (focusWorldPos.x - c.x) * c.s + width/2;
  const fy = (focusWorldPos.y - c.y) * c.s + height/2;
  const eyeScreenW = (240 * eyeScale) * c.s;
  const radius = eyeScreenW * 1.4;  // inner clear-ish radius
  const maxR  = max(width, height) * 0.85;

  const ctx = drawingContext;
  ctx.save();
  // Always use RGB; ignore any HSB mode from eyes
  ctx.globalAlpha = 1.0;
  const g = ctx.createRadialGradient(fx, fy, radius, fx, fy, maxR);
  g.addColorStop(0.0, `rgba(0,0,0,0)`);
  g.addColorStop(1.0, `rgba(0,0,0,${app.vignetteStrength})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, width, height);
  ctx.restore();
}

// --------------------------------------------------------------------------
// EFFECT DISPATCH (fixed per energy type)
function getEyeLabel(i) {
  const ph = (eyes[i] && eyes[i].phrase) ? String(eyes[i].phrase).toUpperCase() : "";
  if (ph) return ph;
  const n = (eyes[i] && eyes[i].constructor && eyes[i].constructor.name) || "";
  if (/Eye1_Grid/i.test(n)) return "PROJECTOR";
  if (/Eye2_Fraser/i.test(n)) return "REFLECTOR";
  if (/Eye3_Ribbons/i.test(n)) return "MANIFESTOR";
  if (/Eye4_Generator/i.test(n)) return "GENERATOR";
  if (/Eye5_ManGen/i.test(n)) return "MANIFESTING GENERATOR";
  return "";
}

function selectEffectFor(index) {
  const label = getEyeLabel(index);
  const kind = EFFECT_BY_TYPE[label] || "run";
  app.effect = { kind, t:0, dur: DURS[kind], data:{} };
}

// --------------------------------------------------------------------------
// SECONDARY EFFECTS (efficient, RGB-safe)
function runSecondaryEffect(eyeObj, localPos, ef) {
  ef.t += deltaTime;
  const u = constrain(ef.t / ef.dur, 0, 1);

  push();
  translate(localPos.x, localPos.y);
  colorMode(RGB, 255, 255, 255, 255); // avoid HSB bleed from eye classes

  switch (ef.kind) {
    case "run": {
      const dist = 600;
      const off = easeInOutCubic(u) * dist;
      // Eye running diagonally up-right
      push();
      translate(off, -off*0.25);
      eyeObj.drawAt(0, 0, eyeScale);
      // legs (super light)
      stroke(255); strokeWeight(2);
      const step = sin(u * TWO_PI * 6);
      line(-60, 60, -60 + 20*step, 90);
      line(-20, 60, -20 - 20*step, 90);
      pop();
      break;
    }
    case "explode": {
      eyeObj.drawAt(0, 0, eyeScale);
      noStroke();
      const N = 48;
      for (let i = 0; i < N; i++) {
        const a = (i/N) * TWO_PI;
        const r = map(u, 0, 1, 10, 360);
        const x = cos(a) * r, y = sin(a) * r * 0.52;
        fill(255, map(1-u, 0, 1, 0, 220));
        circle(x, y, 4 + (1-u)*10);
      }
      break;
    }
    case "melt": {
      const squish = 1 + u*1.1;
      const sag = u * 100;
      push();
      scale(1, squish);
      translate(0, sag);
      eyeObj.drawAt(0, 0, eyeScale);
      noStroke(); fill(255, 170);
      for (let i=0;i<5;i++){
        const dx = -70 + i*35 + sin((i+u*8))*8;
        const dy = u*u*140 + sin((i*0.8+u*10))*6;
        rect(dx, dy, 10, 50*(1-u), 6);
      }
      pop();
      noStroke(); fill(255, 85);
      ellipse(0, 180, 240*u, 70*u);
      break;
    }
    case "break": {
      const sep = easeInOutCubic(u) * 200;
      const angle = radians(8) * u;
      const w = 240*eyeScale, h = w*0.52;
      const g = drawingContext;

      // Left half
      g.save(); g.beginPath();
      g.rect(-w/2-10, -h-10, w/2+20, h*2+20); g.clip();
      push(); translate(-sep/2, u*26); rotate(-angle);
      eyeObj.drawAt(0, 0, eyeScale);
      pop(); g.restore();

      // Right half
      g.save(); g.beginPath();
      g.rect(0, -h-10, w/2+10, h*2+20); g.clip();
      push(); translate(sep/2, u*26); rotate(angle);
      eyeObj.drawAt(0, 0, eyeScale);
      pop(); g.restore();
      break;
    }
    case "burn": {
      eyeObj.drawAt(0, 0, eyeScale);
      const flames = 24;
      for (let i=0;i<flames;i++){
        const a = (i/flames)*TWO_PI;
        const r = 60 + noise(i*0.2, u*2)*110;
        const x = cos(a)*r, y = sin(a)*r*0.52 - u*110;
        noStroke(); fill(255, 120 + 100*sin(i+u*6), 30, 200*(1-u*0.6));
        circle(x, y, 36*(1-u));
      }
      noStroke(); fill(0, 130*u);
      const w = 240*eyeScale, h = w*0.52;
      ellipse(0, 0, w*1.05, h*1.05);
      break;
    }
  }

  pop();
  return ef.t >= ef.dur;
}

// --------------------------------------------------------------------------
// UTILS
function easeInOutCubic(x) { return x < 0.5 ? 4 * x*x*x : 1 - pow(-2*x + 2, 3)/2; }

// =================== SHARED HELPERS =======================
function withEyeClip(eyeW, eyeH, drawFn) {
  const w = eyeW, h = eyeH;
  const L = -w / 2, R = w / 2;
  const ctx = drawingContext;
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(L, 0);
  ctx.bezierCurveTo(L + w * 0.25, -h * 0.55, R - w * 0.25, -h * 0.55, R, 0);
  ctx.bezierCurveTo(R - w * 0.25, h * 0.55, L + w * 0.25, h * 0.55, L, 0);
  ctx.closePath();
  ctx.clip();
  drawFn();
  ctx.restore();
}

function withCircleClip(cx, cy, r, drawFn) {
  const ctx = drawingContext;
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2, false);
  ctx.closePath();
  ctx.clip();
  drawFn();
  ctx.restore();
}

function drawEyeOutline(eyeW, eyeH) {
  const w = eyeW, h = eyeH;
  const L = -w / 2, R = w / 2;
  beginShape();
  vertex(L, 0);
  bezierVertex(L + w * 0.25, -h * 0.55, R - w * 0.25, -h * 0.55, R, 0);
  bezierVertex(R - w * 0.25, h * 0.55, L + w * 0.25, h * 0.55, L, 0);
  endShape(CLOSE);
}

function lidEdgeY(eyeH, blinkAmt, isHover, SLIT_FRACTION = 0.04) {
  const openY = -eyeH * 0.65;
  let closedY;
  if (isHover) {
    const slitPx = eyeH * SLIT_FRACTION;
    closedY = bottomMidY(eyeH) - slitPx;
  } else {
    closedY = -eyeH * 0.05;
  }
  return lerp(openY, closedY, constrain(blinkAmt, 0, 1));
}

function autoBlink(nowMs, periodMs, durMs) {
  const t = nowMs % periodMs;
  if (t < durMs) return t / durMs;
  if (t > periodMs - durMs) return (periodMs - t) / durMs;
  return 0;
}

function bottomMidY(h) {
  const p0 = 0, p1 = h * 0.55, p2 = h * 0.55, p3 = 0;
  const u = 0.5, uu = (1 - u);
  return uu * uu * uu * p0 + 3 * uu * uu * u * p1 + 3 * uu * u * u * p2 + u * u * u * p3;
}

function drawStar(cx, cy, rOuter, rInner, points=5) {
  beginShape();
  for (let i = 0; i < points * 2; i++) {
    const a = (PI / points) * i - HALF_PI;
    const r = (i % 2 === 0) ? rOuter : rInner;
    vertex(cx + cos(a) * r, cy + sin(a) * r);
  }
  endShape(CLOSE);
}

function frac(x) { return x - Math.floor(x); }

function lerpAngle(a, b, t) {
  let diff = (b - a + PI) % (TWO_PI) - PI;
  return a + diff * t;
}

// =================== EYE CLASSES =======================
// ============================================================
// =================== EYE #1: PERSPECTIVE GRID =====================
// ============================================================
class Eye1_Grid {
  constructor(eyelidPhrase = "") {
    // State
    this.blinkAmt = 0;
    this.eyeCX = 0;
    this.eyeCY = 0;
    this.phrase = eyelidPhrase;
    this.timeOffset = random(4000); // Unique random offset for blinking
    
    // Config
    this.blinkPeriod = 7000;
    this.blinkDuration = 650;
    this.blinkEase = 0.1; 
    this.moveEase = 0.14;
    this.hitPad = 1.08;
    this.SLIT_FRACTION = 0.04;
    this.GRIDCFG = {
      color: { r: 209, g: 0, b: 239 },
      alphaGlow: 0.08, alphaMid: 0.18, alphaCore: 0.55,
      lengthScale: 1.25, nVertical: 18, nHorizontal: 28,
      perspGamma: 2.0, speed: 0.40
    };
  }

  drawAt(x, y, s = 1) {
    push();
    translate(x, y);
    scale(s);
    
    colorMode(RGB, 255, 255, 255, 1);
    strokeCap(ROUND);
    strokeJoin(ROUND);
    noFill();

    const base = 240;
    const eyeW = base;
    const eyeH = base * 0.52;
    const pupilR = eyeH * 0.24;

    const mx = mouseX - x;
    const my = mouseY - y;
    const insideEye = (mx * mx) / sq((eyeW / 2) * this.hitPad) + (my * my) / sq((eyeH / 2) * this.hitPad) <= 1;

    let targetBlink = autoBlink(millis() + this.timeOffset, this.blinkPeriod, this.blinkDuration);
    if (insideEye) targetBlink = 1;
    this.blinkAmt = lerp(this.blinkAmt, targetBlink, this.blinkEase);
    const easedLid = easeInOutCubic(constrain(this.blinkAmt, 0, 1));

    const maxOffset = eyeH * 0.18;
    let tx = mx, ty = my;
    const mLen = Math.sqrt(tx * tx + ty * ty);
    if (mLen > maxOffset && mLen > 0) { const k = maxOffset / mLen; tx *= k; ty *= k; }
    this.eyeCX = lerp(this.eyeCX, tx, this.moveEase);
    this.eyeCY = lerp(this.eyeCY, ty, this.moveEase);
    
    withEyeClip(eyeW, eyeH, () => {
      push();
      translate(this.eyeCX, this.eyeCY);
      this.drawAllFourWedges(eyeW, eyeH, { reverse: false, scale: 1.0 });
      push();
      drawingContext.save();
      drawingContext.beginPath();
      drawingContext.arc(0, 0, pupilR, 0, TWO_PI);
      drawingContext.clip();
      this.drawAllFourWedges(eyeW, eyeH, { reverse: true, scale: 0.65 });
      drawingContext.restore();
      noFill();
      stroke(220, 220, 220, 1);
      strokeWeight(1.8);
      circle(0, 0, pupilR * 2);
      pop();
      
      this.drawTopLid(eyeW, eyeH, easedLid, color(134, 29, 194), insideEye);
      const yEdge = lidEdgeY(eyeH, easedLid, insideEye, this.SLIT_FRACTION);
      const ctx = drawingContext;
      ctx.save();
      ctx.beginPath();
      ctx.rect(-eyeW / 2 - 2, -eyeH, eyeW + 4, yEdge + eyeH);
      ctx.clip();
      fill(255); noStroke(); textAlign(CENTER, CENTER);
      textSize(eyeH * 0.14);
      text(this.phrase, 0, -eyeH * 0.07);
      ctx.restore();
      
      pop();
    });

    noFill();
    stroke(255);
    strokeWeight(1.5);
    drawEyeOutline(eyeW, eyeH);
    
    pop();
  }
  
  drawAllFourWedges(eyeW, eyeH, options) {
    const reverse = !!options.reverse;
    const scaleVal = (options.scale == null) ? 1.0 : options.scale;
    const L = Math.max(eyeW, eyeH) * this.GRIDCFG.lengthScale * scaleVal;
    const t = millis() * 0.001;
    const cycle = t * this.GRIDCFG.speed * (reverse ? -1 : 1);
    const right = createVector(1, 0), left = createVector(-1, 0);
    const up = createVector(0, -1), down = createVector(0, 1);
    this.drawWedgeGrid(right, up, L, cycle);
    this.drawWedgeGrid(right, down, L, cycle);
    this.drawWedgeGrid(left, down, L, cycle);
    this.drawWedgeGrid(left, up, L, cycle);
  }

  drawWedgeGrid(dirA, dirB, L, cycle) {
    dirA = dirA.copy().normalize();
    dirB = dirB.copy().normalize();
    const farA = p5.Vector.mult(dirA, L);
    const farB = p5.Vector.mult(dirB, L);
    for (let i = 0; i <= this.GRIDCFG.nVertical; i++) {
      const v = i / this.GRIDCFG.nVertical;
      const edgePoint = p5.Vector.lerp(farA, farB, v);
      this.drawGlowLine(0, 0, edgePoint.x, edgePoint.y);
    }
    const total = this.GRIDCFG.nHorizontal + 8;
    for (let k = -4; k < total - 4; k++) {
      const f = frac((k + cycle) / this.GRIDCFG.nHorizontal);
      const tt = 1 - Math.pow(1 - f, this.GRIDCFG.perspGamma);
      const pA = p5.Vector.mult(dirA, tt * L);
      const pB = p5.Vector.mult(dirB, tt * L);
      this.drawGlowLine(pA.x, pA.y, pB.x, pB.y);
    }
  }

  drawGlowLine(x1, y1, x2, y2) {
    const c = this.GRIDCFG.color;
    stroke(c.r, c.g, c.b, this.GRIDCFG.alphaGlow); strokeWeight(5.5); line(x1, y1, x2, y2);
    stroke(c.r, c.g, c.b, this.GRIDCFG.alphaMid); strokeWeight(3.0); line(x1, y1, x2, y2);
    stroke(c.r, c.g, c.b, this.GRIDCFG.alphaCore); strokeWeight(1.6); line(x1, y1, x2, y2);
  }
  
  drawTopLid(eyeW, eyeH, blinkAmt, fillCol, isHover) {
  if (blinkAmt <= 0.0001) return;
     const yEdge = lidEdgeY(eyeH, blinkAmt, isHover, this.SLIT_FRACTION);
  noStroke(); fill(fillCol);
  rectMode(CORNERS);
     rect(-eyeW / 2 - 5, -height, eyeW / 2 + 5, yEdge);
  }
}

// ============================================================
// =================== EYE #2: FRASER SPIRAL =====================
// ============================================================
class Eye2_Fraser {
  constructor(eyelidPhrase = "") {
    this.blinkAmt = 0;
    this.eyeCX = 0;
    this.eyeCY = 0;
    this.phrase = eyelidPhrase;
    this.timeOffset = random(4000); // Unique random offset for blinking
    
    this.blinkPeriod = 7000;
    this.blinkDuration = 650;
    this.blinkEase = 0.1;
    this.moveEase = 0.14; this.hitPad = 1.08; this.SLIT_FRACTION = 0.04;
    this.FRASER = { rStep: 6.0, aStep: 0.10, m: 6.0, k: 0.28, omega: 1.2, bands: 8, hueBase: 290, hueSpan: 320, sat: 90, briHi: 100, briLo: 60, alpha: 0.95, tilt: 12 * Math.PI/180, expand: 1.08 };
    this.FRASER_PUPIL = { rStep: 3.5, aStep: 0.08, m: 6.0, k: 0.30, omega: -1.4, bands: 9, hueBase: 290, hueSpan: 320, sat: 90, briHi: 100, briLo: 55, alpha: 0.95, tilt: 10 * Math.PI/180, expand: 1.08 };
  }
  
  drawAt(x, y, s = 1) {
    push();
    translate(x, y);
    scale(s);
    
    colorMode(HSB, 360, 100, 100, 1);
    noStroke();
    
    const base = 240;
    const eyeW = base;
    const eyeH = base * 0.52;
    const pupilR = eyeH * 0.20;
    
    const mx = mouseX - x;
    const my = mouseY - y;
    const insideEye = (mx * mx) / sq((eyeW / 2) * this.hitPad) + (my * my) / sq((eyeH / 2) * this.hitPad) <= 1;

    let targetBlink = autoBlink(millis() + this.timeOffset, this.blinkPeriod, this.blinkDuration);
    if (insideEye) targetBlink = 1;
    this.blinkAmt = lerp(this.blinkAmt, targetBlink, this.blinkEase);
    const easedLid = easeInOutCubic(constrain(this.blinkAmt, 0, 1));

    const maxOffset = eyeH * 0.18;
    let tx = mx, ty = my;
    const mLen = Math.sqrt(tx * tx + ty * ty);
    if (mLen > maxOffset && mLen > 0) { const k = maxOffset / mLen; tx *= k; ty *= k; }
    this.eyeCX = lerp(this.eyeCX, tx, this.moveEase);
    this.eyeCY = lerp(this.eyeCY, ty, this.moveEase);
    
    withEyeClip(eyeW, eyeH, () => {
      push();
      translate(this.eyeCX, this.eyeCY);
      this.drawFraserTilesField(eyeW, eyeH, pupilR, this.FRASER, 0.65, 0.60);
      pop();
      push();
      translate(this.eyeCX, this.eyeCY);
      withCircleClip(0, 0, pupilR * 1.005, () => {
        this.drawFraserTilesField(pupilR*2.2, pupilR*2.2, 0, this.FRASER_PUPIL, 1.10, 0.0);
      });
      pop();
      push();
      translate(this.eyeCX, this.eyeCY);
      noFill();
      stroke(0, 0, 85, 1);
      strokeWeight(1.6);
      circle(0, 0, pupilR * 2);
      pop();

      this.drawTopLid(eyeW, eyeH, easedLid, color(278, 77, 76, 1), insideEye);
      const yEdge = lidEdgeY(eyeH, easedLid, insideEye, this.SLIT_FRACTION);
      const ctx = drawingContext;
      ctx.save();
      ctx.beginPath();
      ctx.rect(-eyeW / 2 - 2, -eyeH, eyeW + 4, yEdge + eyeH);
      ctx.clip();
      fill(0, 0, 100); noStroke(); textAlign(CENTER, CENTER);
      textSize(eyeH * 0.14);
      text(this.phrase, 0, -eyeH * 0.07);
      ctx.restore();
    });
    
    noFill();
    stroke(255);
    strokeWeight(1.5);
    drawEyeOutline(eyeW, eyeH);
    pop();
  }

  drawFraserTilesField(bboxW, bboxH, innerRadius, cfg, coverFactor, innerFactor) {
    const maxR  = Math.min(bboxW, bboxH) * (coverFactor || 0.95);
    const t = millis() * 0.001;
    const rot = cfg.omega * t;
    const startR = Math.max(innerRadius * (innerFactor || 0.60), 0);
    for (let r = startR; r <= maxR; r += cfg.rStep) {
      const r2 = Math.min(r + cfg.rStep, maxR);
      const rMid = (r + r2) * 0.5;
      for (let a0 = 0; a0 < Math.PI*2; a0 += cfg.aStep) {
        const a1 = a0 + cfg.aStep;
        const aMid = (a0 + a1) * 0.5;
        const p = cfg.m * (aMid + rot) + cfg.k * rMid;
        const s = Math.sin(p);
        const bands = Math.max(2, Math.floor(cfg.bands));
        let idx = Math.floor((0.5 + 0.5 * s) * bands);
        if (idx >= bands) idx = bands - 1;
        const hue = (cfg.hueBase + (cfg.hueSpan * idx / (bands - 1))) % 360;
        const bri = lerp(cfg.briLo, cfg.briHi, 0.5 + 0.5*s);
        fill(hue, cfg.sat, bri, cfg.alpha);
        const erx = Math.cos(aMid), ery = Math.sin(aMid);
        const etx = -Math.sin(aMid), ety = Math.cos(aMid);
        const hr = (r2 - r) * 0.5 * cfg.expand;
        const ht = (a1 - a0) * rMid * 0.5 * cfg.expand;
        const c = Math.cos(cfg.tilt), sT = Math.sin(cfg.tilt);
        const ux =  c*erx + sT*etx, uy =  c*ery + sT*ety;
        const vx = -sT*erx + c*etx, vy = -sT*ery + c*ety;
        const px = erx * rMid, py = ery * rMid;
        beginShape();
        vertex(px + ux * hr, py + uy * hr);
        vertex(px + vx * ht, py + vy * ht);
        vertex(px - ux * hr, py - uy * hr);
        vertex(px - vx * ht, py - vy * ht);
        endShape(CLOSE);
      }
    }
  }
  
  drawTopLid(eyeW, eyeH, blinkAmt, fillCol, isHover) {
     if (blinkAmt <= 0.0001) return;
     const yEdge = lidEdgeY(eyeH, blinkAmt, isHover, this.SLIT_FRACTION);
     noStroke(); fill(fillCol);
     rectMode(CORNERS);
     rect(-eyeW / 2 - 5, -height, eyeW / 2 + 5, yEdge);
  }
}

// ============================================================
// =================== EYE #3: RIBBONS =====================
// ============================================================
class Eye3_Ribbons {
  constructor(eyelidPhrase = "") {
    this.blinkAmt = 0;
    this.eyeCX = 0;
    this.eyeCY = 0;
    this.starRot = 0;
    this.phrase = eyelidPhrase;
    this.timeOffset = random(4000); // Unique random offset for blinking
    
    this.blinkPeriod = 7000;
    this.blinkDuration = 650;
    this.blinkEase = 0.1;
    this.moveEase = 0.14; this.hitPad = 1.08; this.SLIT_FRACTION = 0.04;
  }
  
  drawAt(x, y, s = 1) {
    push();
    translate(x, y);
    scale(s);
    
    colorMode(RGB);
    strokeJoin(ROUND);
    strokeCap(ROUND);
    noStroke();
    
    const base = 240;
    const eyeW = base;
    const eyeH = base * 0.52;
    const pupilR = eyeH * 0.36;
    const starOuter = eyeH * 0.28;
    const starInner = starOuter * 0.46;

    const mx = mouseX - x;
    const my = mouseY - y;
    const insideEye = (mx*mx)/sq((eyeW/2)*this.hitPad) + (my*my)/sq((eyeH/2)*this.hitPad) <= 1;

    let targetBlink = autoBlink(millis() + this.timeOffset, this.blinkPeriod, this.blinkDuration);
    if (insideEye) targetBlink = 1;
    this.blinkAmt = lerp(this.blinkAmt, targetBlink, this.blinkEase);
    const easedLid = easeInOutCubic(constrain(this.blinkAmt, 0, 1));
    
    const maxOffset = eyeH * 0.18;
    let tx = mx, ty = my;
    const mLen = sqrt(tx*tx + ty*ty);
    if (mLen > maxOffset && mLen > 0) { const k = maxOffset/mLen; tx *= k; ty *= k; }
    this.eyeCX = lerp(this.eyeCX, tx, this.moveEase);
    this.eyeCY = lerp(this.eyeCY, ty, this.moveEase);
    this.starRot = lerpAngle(this.starRot, atan2(my, mx), this.moveEase * 0.9);
    
    withEyeClip(eyeW, eyeH, () => {
      const rs = [
        { fill: color('#F20045'), alpha: 150, baseAmp: 10, waveFreq: 0.018, timeSpeed: 1.8, wStart: 6, wEnd: 52, wobbleAmt: 0.22, wobbleFreq: 0.8, wobbleTime: 0.9, len: 260, steps: 80, seedShift: 1111 },
        { fill: color('#861DC2'), alpha: 120, baseAmp: 12, waveFreq: 0.014, timeSpeed: 2.6, wStart: 5, wEnd: 60, wobbleAmt: 0.28, wobbleFreq: 1.1, wobbleTime: 0.7, len: 270, steps: 85, seedShift: 2222 },
        { fill: color('#20D6FF'), alpha: 110, baseAmp:  8, waveFreq: 0.022, timeSpeed: 1.4, wStart: 4, wEnd: 46, wobbleAmt: 0.18, wobbleFreq: 0.9, wobbleTime: 1.1, len: 250, steps: 70, seedShift: 3333 },
        { fill: color('#FFE14A'), alpha:  90, baseAmp: 14, waveFreq: 0.016, timeSpeed: 2.1, wStart: 7, wEnd: 58, wobbleAmt: 0.25, wobbleFreq: 0.7, wobbleTime: 1.0, len: 280, steps: 90, seedShift: 4444 }
      ];
      for (const r of rs) {
        this.drawContrailRibbon(this.eyeCX, this.eyeCY, r.len, r.steps, r.baseAmp, r.waveFreq, r.timeSpeed, r.wStart, r.wEnd, r.wobbleAmt, r.wobbleFreq, r.wobbleTime, r.fill, r.alpha, r.seedShift);
        this.drawContrailRibbon(this.eyeCX, this.eyeCY, -r.len, r.steps, r.baseAmp, r.waveFreq, r.timeSpeed, r.wStart, r.wEnd, r.wobbleAmt, r.wobbleFreq, r.wobbleTime, r.fill, r.alpha, r.seedShift);
      }
      push();
      translate(this.eyeCX, this.eyeCY);
      stroke(200); strokeWeight(1.5); fill(0);
      circle(0, 0, pupilR * 2);
      noFill(); stroke(255); strokeWeight(2);
      push();
      rotate(this.starRot);
      drawStar(0, 0, starOuter, starInner, 5);
      scale(0.6);
      drawStar(0, 0, starOuter, starInner, 5);
      pop(); pop();
      
      this.drawTopLid(eyeW, eyeH, easedLid, color('#861DC2'), insideEye);
      const yEdge = lidEdgeY(eyeH, easedLid, insideEye, this.SLIT_FRACTION);
      const ctx = drawingContext;
      ctx.save();
      ctx.beginPath();
      ctx.rect(-eyeW / 2 - 2, -eyeH, eyeW + 4, yEdge + eyeH);
      ctx.clip();
      fill(255); noStroke(); textAlign(CENTER, CENTER);
      textSize(eyeH * 0.14);
      text(this.phrase, 0, -eyeH * 0.07);
      ctx.restore();
    });
    
    stroke(255); strokeWeight(1.5); noFill();
    drawEyeOutline(eyeW, eyeH);
    pop();
  }
  
  drawContrailRibbon(px, py, len, steps, baseAmp, waveFreq, timeSpeed, wStart, wEnd, wobbleAmt, wobbleFreq, wobbleTime, colorFill, alpha, seedShift) {
    let ptsTop = [], ptsBot = [];
    const time = millis() * 0.001;
    const centerAt = (u) => {
      const x = px - (1 - u) * len;
      const y = py + sin((x * waveFreq) + time * timeSpeed) * baseAmp + sin((x * waveFreq * 0.53) + time * 1.3) * (baseAmp * 0.22);
      return createVector(x, y);
    };
    const du = 1 / steps;
    for (let i = 0; i <= steps; i++) {
      const u = i * du;
      const p = centerAt(u);
      const p2 = centerAt(min(u + du, 1));
      const tx = p2.x - p.x, ty = p2.y - p.y;
      const mag = max(1e-6, sqrt(tx*tx + ty*ty));
      const nx = -ty / mag, ny = tx / mag;
      let w = lerp(wStart, wEnd, u);
      const n1 = noise(u * wobbleFreq, time * wobbleTime) * 2 - 1;
      const n2 = noise((u + (seedShift||0)) * wobbleFreq, time * wobbleTime) * 2 - 1;
      w *= 1 + wobbleAmt * constrain((n1 + n2) * 0.5, -1, 1);
      ptsTop.push(createVector(p.x + nx * w * 0.5, p.y + ny * w * 0.5));
      ptsBot.push(createVector(p.x - nx * w * 0.5, p.y - ny * w * 0.5));
    }
    push();
    fill(red(colorFill), green(colorFill), blue(colorFill), alpha || 120);
    beginShape();
    for (const pt of ptsTop) vertex(pt.x, pt.y);
    for (let j = ptsBot.length - 1; j >= 0; j--) vertex(ptsBot[j].x, ptsBot[j].y);
    endShape(CLOSE);
    pop();
  }

  drawTopLid(eyeW, eyeH, blinkAmt, fillCol, isHover) {
     if (blinkAmt <= 0.0001) return;
     const yEdge = lidEdgeY(eyeH, blinkAmt, isHover, this.SLIT_FRACTION);
     noStroke(); fill(fillCol);
     rectMode(CORNERS);
     rect(-eyeW / 2 - 5, -height, eyeW / 2 + 5, yEdge);
  }
}

class Eye4_Generator {
  constructor(eyelidPhrase = "GENERATOR") {
    this.phrase = eyelidPhrase;
    this.blinkAmt = 0;
    this.eyeCX = 0;
    this.eyeCY = 0;
    this.timeOffset = random(4000);
    this.blinkPeriod = 7000;
    this.blinkDuration = 650;
    this.blinkEase = 0.1;
    this.moveEase = 0.14;
    this.hitPad = 1.08;
    this.SLIT_FRACTION = 0.04;
    this.base = 240;
    this.pulseSpeed = 0.85;
    this.gearTeeth = 36;
    this.gearSpeed = 0.12;
  }

  drawAt(x, y, s = 1) {
    push();
    translate(x, y);
    scale(s);
    
    const eyeW = this.base;
    const eyeH = this.base * 0.52;
    const pupilR = eyeH * 0.24;

    const mx = mouseX - x;
    const my = mouseY - y;
    const insideEye = (mx * mx) / sq((eyeW / 2) * this.hitPad) + (my * my) / sq((eyeH / 2) * this.hitPad) <= 1;

    let targetBlink = autoBlink(millis() + this.timeOffset, this.blinkPeriod, this.blinkDuration);
    if (insideEye) targetBlink = 1;
    this.blinkAmt = lerp(this.blinkAmt, targetBlink, this.blinkEase);
    const easedLid = easeInOutCubic(constrain(this.blinkAmt, 0, 1));

    const maxOffset = eyeH * 0.18;
    let tx = mx, ty = my;
    const mLen = sqrt(tx * tx + ty * ty);
    if (mLen > maxOffset && mLen > 0) { const k = maxOffset / mLen; tx *= k; ty *= k; }
    this.eyeCX = lerp(this.eyeCX, tx, this.moveEase);
    this.eyeCY = lerp(this.eyeCY, ty, this.moveEase);

    withEyeClip(eyeW, eyeH, () => {
      push();
      translate(this.eyeCX * 0.25, this.eyeCY * 0.25);
      const t = millis() * 0.001 * this.pulseSpeed;
      for (let i = 0; i < 3; i++) {
        const ph = t + i * 0.33;
        const r = eyeH * (0.25 + 0.22 * (0.5 + 0.5 * sin(TWO_PI * ph)));
        const a = 160 - i * 50;
        noFill();
        stroke(255, 180, 60, a); strokeWeight(18 - i * 6); ellipse(0, 0, r * 2.2, r * 2.2 * (eyeH / eyeW));
        stroke(220, 60, 30, a * 0.8); strokeWeight(8 - i * 2); ellipse(0, 0, r * 1.8, r * 1.8 * (eyeH / eyeW));
      }
      pop();

      push();
      translate(this.eyeCX, this.eyeCY);
      noFill(); stroke(255); strokeWeight(1.2); circle(0, 0, pupilR * 2);
      noStroke(); fill(0); circle(0, 0, pupilR * 1.66);
      pop();

      this.drawTopLid(eyeW, eyeH, easedLid, color(196, 74, 36), insideEye);

      const yEdge = lidEdgeY(eyeH, easedLid, insideEye, this.SLIT_FRACTION);
      const ctx = drawingContext;
      ctx.save();
      ctx.beginPath();
      ctx.rect(-eyeW / 2 - 2, -eyeH, eyeW + 4, yEdge + eyeH);
      ctx.clip();
      fill(255); noStroke(); textAlign(CENTER, CENTER);
      textSize(eyeH * 0.14);
      text(this.phrase, 0, -eyeH * 0.07);
      ctx.restore();
    });

    stroke(255); strokeWeight(1.5); noFill();
    drawEyeOutline(eyeW, eyeH);
    pop();
  }
  
  drawTopLid(eyeW, eyeH, blinkAmt, fillCol, isHover) {
     if (blinkAmt <= 0.0001) return;
     const yEdge = lidEdgeY(eyeH, blinkAmt, isHover, this.SLIT_FRACTION);
     noStroke(); fill(fillCol);
     rectMode(CORNERS);
     rect(-eyeW / 2 - 5, -height, eyeW / 2 + 5, yEdge);
  }
}

class Eye5_ManGen {
  constructor(eyelidPhrase = "MANIFESTING GENERATOR") {
    this.phrase = eyelidPhrase;
    this.blinkAmt = 0;
    this.eyeCX = 0;
    this.eyeCY = 0;
    this.timeOffset = random(4000);
    this.blinkPeriod = 7000;
    this.blinkDuration = 650;
    this.blinkEase = 0.1;
    this.moveEase = 0.14;
    this.hitPad = 1.08;
    this.SLIT_FRACTION = 0.04;
    this.base = 240;
    this.flowSpeed = 0.30;
    this.sparkRate = 0.035;
    this.sparks = [];
  }

  drawAt(x, y, s = 1) {
    push();
    translate(x, y);
    scale(s);
    
    const eyeW = this.base;
    const eyeH = this.base * 0.52;
    const pupilR = eyeH * 0.24;

    const mx = mouseX - x;
    const my = mouseY - y;
    const insideEye = (mx * mx) / sq((eyeW / 2) * this.hitPad) + (my * my) / sq((eyeH / 2) * this.hitPad) <= 1;

    let targetBlink = autoBlink(millis() + this.timeOffset, this.blinkPeriod, this.blinkDuration);
    if (insideEye) targetBlink = 1;
    this.blinkAmt = lerp(this.blinkAmt, targetBlink, this.blinkEase);
    const easedLid = easeInOutCubic(constrain(this.blinkAmt, 0, 1));

    const maxOffset = eyeH * 0.18;
    let tx = mx, ty = my;
    const mLen = sqrt(tx * tx + ty * ty);
    if (mLen > maxOffset && mLen > 0) { const k = maxOffset / mLen; tx *= k; ty *= k; }
    this.eyeCX = lerp(this.eyeCX, tx, this.moveEase);
    this.eyeCY = lerp(this.eyeCY, ty, this.moveEase);

    withEyeClip(eyeW, eyeH, () => {
      // Simple flow effect
      const t = millis() * 0.001 * this.flowSpeed;
      for (let k = 0; k < 3; k++) {
        const rot = t + k * TWO_PI / 3;
        push();
        rotate(rot);
        noFill(); stroke(209, 0, 239, 120); strokeWeight(2);
        beginShape();
        for (let i = 0; i <= 80; i++) {
          const u = i / 80;
          const a = lerp(-PI * 0.8, PI * 0.8, u);
          const wob = 0.25 * sin(3 * a + rot * 2.0);
          const x = cos(a) * eyeW * 0.42 * (1 + 0.08 * wob);
          const y = sin(a) * eyeH * 0.26 * (1 - 0.08 * wob);
          curveVertex(x, y);
        }
        endShape();
        pop();
      }

      push();
      translate(this.eyeCX, this.eyeCY);
      noFill(); stroke(230); strokeWeight(1.4); circle(0, 0, pupilR * 2);
      noStroke(); fill(0); circle(0, 0, pupilR * 1.72);
      pop();

      this.drawTopLid(eyeW, eyeH, easedLid, color(134, 29, 194), insideEye);

      const yEdge = lidEdgeY(eyeH, easedLid, insideEye, this.SLIT_FRACTION);
      const ctx2 = drawingContext;
      ctx2.save();
      ctx2.beginPath();
      ctx2.rect(-eyeW/2 - 2, -eyeH, eyeW + 4, yEdge + eyeH);
      ctx2.clip();
      fill(255); noStroke(); textAlign(CENTER, CENTER);
      textSize(eyeH * 0.12);
      text(this.phrase, 0, -eyeH * 0.07);
      ctx2.restore();
    });

    stroke(255); strokeWeight(1.5); noFill();
    drawEyeOutline(eyeW, eyeH);
    pop();
  }
  
  drawTopLid(eyeW, eyeH, blinkAmt, fillCol, isHover) {
     if (blinkAmt <= 0.0001) return;
     const yEdge = lidEdgeY(eyeH, blinkAmt, isHover, this.SLIT_FRACTION);
     noStroke(); fill(fillCol);
     rectMode(CORNERS);
     rect(-eyeW / 2 - 5, -height, eyeW / 2 + 5, yEdge);
  }
}

class Eye1 {
  constructor() {
    this.blinkPeriod = 8000; this.blinkDuration = 650;
    this.blinkEase = 0.22;   this.moveEase = 0.14;
    this.hitPad = 1.08;      this.SLIT_FRACTION = 0.04;
    this.blinkAmt = 0; this.eyeCX = 0; this.eyeCY = 0; this.starRot = 0;
    this.base = 240;
  }
  isHovered(mxAbs, myAbs, s = 1) {
    const eyeW = this.base, eyeH = this.base * 0.52;
    if (!this._lastPos) return false;
    const dx = mxAbs - this._lastPos.x, dy = myAbs - this._lastPos.y;
    return (dx*dx)/sq((eyeW/2)*this.hitPad*s) + (dy*dy)/sq((eyeH/2)*this.hitPad*s) <= 1;
  }
  drawAt(x, y, s = 1) {
    this._lastPos = {x, y};
    const eyeW = this.base, eyeH = this.base * 0.52;
    const pupilR = eyeH * SHARED_PUPIL_FRACTION;
    const starOuter = eyeH * 0.28, starInner = starOuter * 0.46, star2Scale = 0.6;

    const mx = mouseX - x, my = mouseY - y;
    const insideEye = (mx*mx)/sq((eyeW/2)*this.hitPad*s) + (my*my)/sq((eyeH/2)*this.hitPad*s) <= 1;

    let targetBlink = autoBlink(millis(), this.blinkPeriod, this.blinkDuration);
    if (insideEye) targetBlink = 1;
    this.blinkAmt = lerp(this.blinkAmt, targetBlink, this.blinkEase);
    const easedLid = easeInOutCubic(constrain(this.blinkAmt, 0, 1));

    const maxOffset = eyeH * 0.18 * s;
    let tx = mx, ty = my;
    const mLen = sqrt(tx*tx + ty*ty);
    if (mLen > maxOffset && mLen > 0) { const k = maxOffset / mLen; tx *= k; ty *= k; }
    this.eyeCX = lerp(this.eyeCX, tx, this.moveEase);
    this.eyeCY = lerp(this.eyeCY, ty, this.moveEase);
    this.starRot = lerpAngle(this.starRot, atan2(my, mx), this.moveEase * 0.9);

    push();
    translate(x, y); scale(s);

    withEyeClip(eyeW, eyeH, () => {
      const rs = [
        { fill: color('#F20045'), alpha: 150, baseAmp: 10, waveFreq: 0.018, timeSpeed: 1.8, wStart: 6,  wEnd: 52, wobbleAmt: 0.22, wobbleFreq: 0.8, wobbleTime: 0.9, len: 260, steps: 80, seedShift: 1111 },
        { fill: color('#861DC2'), alpha: 120, baseAmp: 12, waveFreq: 0.014, timeSpeed: 2.6, wStart: 5,  wEnd: 60, wobbleAmt: 0.28, wobbleFreq: 1.1, wobbleTime: 0.7, len: 270, steps: 85, seedShift: 2222 },
        { fill: color('#20D6FF'), alpha: 110, baseAmp:  8, waveFreq: 0.022, timeSpeed: 1.4, wStart: 4,  wEnd: 46, wobbleAmt: 0.18, wobbleFreq: 0.9, wobbleTime: 1.1, len: 250, steps: 70, seedShift: 3333 },
        { fill: color('#FFE14A'), alpha:  90, baseAmp: 14, waveFreq: 0.016, timeSpeed: 2.1, wStart: 7,  wEnd: 58, wobbleAmt: 0.25, wobbleFreq: 0.7, wobbleTime: 1.0, len: 280, steps: 90, seedShift: 4444 }
      ];
      for (let r of rs) { this.drawRibbon(this.eyeCX, this.eyeCY,  r.len, r); this.drawRibbon(this.eyeCX, this.eyeCY, -r.len, r); }

      push();
      translate(this.eyeCX, this.eyeCY);
      stroke(200); strokeWeight(1.2); fill(0);
      circle(0, 0, pupilR * 2);
      noFill(); stroke(255); strokeWeight(2);
      push(); rotate(this.starRot);
      this.drawStar(0, 0, starOuter, starInner, 5);
      push(); scale(star2Scale); this.drawStar(0, 0, starOuter, starInner, 5); pop();
      pop(); pop();

      drawTopLidRectSlit(eyeW, eyeH, easedLid, color('#861DC2'), this.SLIT_FRACTION);

      const yEdge = lidEdgeY(eyeH, easedLid, this.SLIT_FRACTION);
      const ctx = drawingContext;
      ctx.save();
      ctx.beginPath();
      ctx.rect(-eyeW/2 - 2, -eyeH, eyeW + 4, yEdge + eyeH);
      ctx.clip();

      fill(255); noStroke(); textAlign(CENTER, CENTER);
      textSize(eyeH * 0.14);
      text("MANIFESTOR", 0, -eyeH * 0.05);
      ctx.restore();
    });

    stroke(255); strokeWeight(OUTLINE_STROKE_W); noFill();
    drawEyeOutline(eyeW, eyeH);

    pop();
  }

  drawRibbon(px, py, len, r) {
    const ptsTop = [], ptsBot = [];
    const time = millis() * 0.001;
    const centerAt = (u) => {
      const x = px - (1 - u) * len;
      const y = py
        + sin((x * r.waveFreq) + time * r.timeSpeed) * r.baseAmp
        + sin((x * r.waveFreq * 0.53) + time * 1.3) * (r.baseAmp * 0.22);
      return createVector(x, y);
    };
    const du = 1 / r.steps;
    for (let i = 0; i <= r.steps; i++) {
      const u  = i * du;
      const p  = centerAt(u);
      const p2 = centerAt(min(u + du, 1));
      const tx = p2.x - p.x, ty = p2.y - p.y;
      const mag = max(1e-6, sqrt(tx*tx + ty*ty));
      const nx = -ty / mag, ny = tx / mag;

      let w = lerp(r.wStart, r.wEnd, u);
      const n1 = noise(u * r.wobbleFreq, time * r.wobbleTime) * 2 - 1;
      const n2 = noise((u + (r.seedShift||0)) * r.wobbleFreq, time * r.wobbleTime) * 2 - 1;
      w *= 1 + r.wobbleAmt * constrain((n1 + n2) * 0.5, -1, 1);

      const half = w * 0.5;
      ptsTop.push(createVector(p.x + nx * half, p.y + ny * half));
      ptsBot.push(createVector(p.x - nx * half, p.y - ny * half));
    }
    fill(red(r.fill), green(r.fill), blue(r.fill), r.alpha || 120);
    beginShape();
    for (let v of ptsTop) vertex(v.x, v.y);
    for (let j = ptsBot.length - 1; j >= 0; j--) vertex(ptsBot[j].x, ptsBot[j].y);
    endShape(CLOSE);
  }
  drawStar(cx, cy, rOuter, rInner, points=5){
    beginShape();
    for (let i = 0; i < points * 2; i++) {
      const a = (PI / points) * i - HALF_PI;
      const r = (i % 2 === 0) ? rOuter : rInner;
      vertex(cx + cos(a) * r, cy + sin(a) * r);
    }
    endShape(CLOSE);
  }
}

class Eye2 {
  constructor() {
    this.blinkPeriod = 8000; this.blinkDuration = 650;
    this.blinkEase = 0.22;   this.moveEase = 0.14;
    this.hitPad = 1.08;      this.SLIT_FRACTION = 0.04;
    this.blinkAmt = 0; this.eyeCX = 0; this.eyeCY = 0;
    this.base = 240;
    this.GRIDCFG = {
      color: { r:209, g:0, b:239 },
      alphaGlow: 0.08, alphaMid: 0.18, alphaCore: 0.55,
      lengthScale: 1.25, nVertical: 18, nHorizontal: 28,
      perspGamma: 2.0, speed: 0.40
    };
  }
  isHovered(mxAbs, myAbs, s = 1) {
    const eyeW = this.base, eyeH = this.base * 0.52;
    if (!this._lastPos) return false;
    const dx = mxAbs - this._lastPos.x, dy = myAbs - this._lastPos.y;
    return (dx*dx)/sq((eyeW/2)*this.hitPad*s) + (dy*dy)/sq((eyeH/2)*this.hitPad*s) <= 1;
  }
  drawAt(x, y, s = 1) {
    this._lastPos = {x, y};
    const eyeW = this.base, eyeH = this.base * 0.52;
    const pupilR = eyeH * SHARED_PUPIL_FRACTION;

    const mx = mouseX - x, my = mouseY - y;
    const insideEye = (mx*mx)/sq((eyeW/2)*this.hitPad*s) + (my*my)/sq((eyeH/2)*this.hitPad*s) <= 1;

    let targetBlink = autoBlink(millis(), this.blinkPeriod, this.blinkDuration);
    if (insideEye) targetBlink = 1;
    this.blinkAmt = lerp(this.blinkAmt, targetBlink, this.blinkEase);
    const easedLid = easeInOutCubic(constrain(this.blinkAmt, 0, 1));

    const maxOffset = eyeH * 0.18 * s;
    let tx = mx, ty = my;
    const mLen = sqrt(tx*tx + ty*ty);
    if (mLen > maxOffset && mLen > 0) { const k = maxOffset / mLen; tx *= k; ty *= k; }
    this.eyeCX = lerp(this.eyeCX, tx, this.moveEase);
    this.eyeCY = lerp(this.eyeCY, ty, this.moveEase);

    push();
    translate(x, y); scale(s);

    push(); colorMode(RGB, 255, 255, 255, 1); // alphas 0..1 locally
    withEyeClip(eyeW, eyeH, () => {
      push(); translate(this.eyeCX, this.eyeCY);
      this.drawAllFourWedges(eyeW, eyeH, { reverse:false, scale:1.0 });

      push();
      const ctx = drawingContext;
      ctx.save(); ctx.beginPath(); ctx.arc(0, 0, pupilR, 0, TWO_PI); ctx.clip();
      this.drawAllFourWedges(eyeW, eyeH, { reverse:true, scale:0.65 });
      ctx.restore();
      noFill(); stroke(220); strokeWeight(1.4); circle(0, 0, pupilR * 2);
      pop();

      drawTopLidRectSlit(eyeW, eyeH, easedLid, color(134, 29, 194), this.SLIT_FRACTION);

      const yEdge = lidEdgeY(eyeH, easedLid, this.SLIT_FRACTION);
      const ctx2 = drawingContext;
      ctx2.save();
      ctx2.beginPath();
      ctx2.rect(-eyeW/2 - 2, -eyeH, eyeW + 4, yEdge + eyeH);
      ctx2.clip();

      fill(255); noStroke(); textAlign(CENTER, CENTER);
      textSize(eyeH * 0.14);
      text("PROJECTOR", 0, -eyeH * 0.05);
      ctx2.restore();
      pop();
    });
    pop(); // restore colorMode

    stroke(255); strokeWeight(OUTLINE_STROKE_W); noFill();
    drawEyeOutline(eyeW, eyeH);

    pop();
  }

  drawAllFourWedges(eyeW, eyeH, options) {
    const reverse = !!options.reverse;
    const scale = (options.scale == null) ? 1.0 : options.scale;
    const L = max(eyeW, eyeH) * this.GRIDCFG.lengthScale * scale;
    const t = millis() * 0.001;
    const cycle = t * this.GRIDCFG.speed * (reverse ? -1 : 1);

    const right = createVector(1, 0), left = createVector(-1, 0);
    const up = createVector(0, -1), down = createVector(0, 1);

    this.drawWedgeGrid(right, up,   L, cycle);
    this.drawWedgeGrid(right, down, L, cycle);
    this.drawWedgeGrid(left,  down, L, cycle);
    this.drawWedgeGrid(left,  up,   L, cycle);
  }
  drawWedgeGrid(dirA, dirB, L, cycle) {
    dirA = dirA.copy().normalize(); dirB = dirB.copy().normalize();
    const farA = p5.Vector.mult(dirA, L), farB = p5.Vector.mult(dirB, L);

    for (let i = 0; i <= this.GRIDCFG.nVertical; i++) {
      const v = i / this.GRIDCFG.nVertical;
      const edgePoint = p5.Vector.lerp(farA, farB, v);
      this.drawGlowLine(0, 0, edgePoint.x, edgePoint.y);
    }
    const total = this.GRIDCFG.nHorizontal + 8;
    for (let k = -4; k < total - 4; k++) {
      const f = this.frac((k + cycle) / this.GRIDCFG.nHorizontal);
      const tt = 1 - pow(1 - f, this.GRIDCFG.perspGamma);
      const pA = p5.Vector.mult(dirA, tt * L), pB = p5.Vector.mult(dirB, tt * L);
      this.drawGlowSegment(pA.x, pA.y, pB.x, pB.y);
    }
  }
  drawGlowLine(x1, y1, x2, y2) {
    const c = this.GRIDCFG.color;
    stroke(c.r, c.g, c.b, this.GRIDCFG.alphaGlow); strokeWeight(5.5); line(x1, y1, x2, y2);
    stroke(c.r, c.g, c.b, this.GRIDCFG.alphaMid ); strokeWeight(3.0); line(x1, y1, x2, y2);
    stroke(c.r, c.g, c.b, this.GRIDCFG.alphaCore); strokeWeight(1.6); line(x1, y1, x2, y2);
  }
  drawGlowSegment(x1, y1, x2, y2){ this.drawGlowLine(x1, y1, x2, y2); }
  frac(x){ return x - floor(x); }
}

class Eye3 {
  constructor() {
    this.blinkPeriod = 8000; this.blinkDuration = 650;
    this.blinkEase = 0.22;   this.moveEase = 0.14;
    this.hitPad = 1.08;      this.SLIT_FRACTION = 0.04;
    this.blinkAmt = 0; this.eyeCX = 0; this.eyeCY = 0;
    this.base = 240;
    this.FRASER = {
      rStep: 6.0, aStep: 0.10, m: 6.0, k: 0.28, omega: 1.2,
      bands: 8, hueBase: 290, hueSpan: 320, sat: 90, briHi: 100, briLo: 60,
      alpha: 0.95, tilt: 12 * PI/180, expand: 1.08
    };
    this.FRASER_PUPIL = {
      rStep: 3.5, aStep: 0.08, m: 6.0, k: 0.30, omega: -1.4,
      bands: 9, hueBase: 290, hueSpan: 320, sat: 90, briHi: 100, briLo: 55,
      alpha: 0.95, tilt: 10 * PI/180, expand: 1.08
    };
    this.SHOW_PUPIL_STROKE = true;
  }
  isHovered(mxAbs, myAbs, s = 1) {
    const eyeW = this.base, eyeH = this.base * 0.52;
    if (!this._lastPos) return false;
    const dx = mxAbs - this._lastPos.x, dy = myAbs - this._lastPos.y;
    return (dx*dx)/sq((eyeW/2)*this.hitPad*s) + (dy*dy)/sq((eyeH/2)*this.hitPad*s) <= 1;
  }
  drawAt(x, y, s = 1) {
    this._lastPos = {x, y};
    const eyeW = this.base, eyeH = this.base * 0.52;
    const pupilR = eyeH * SHARED_PUPIL_FRACTION;

    const mx = mouseX - x, my = mouseY - y;
    const insideEye = (mx*mx)/sq((eyeW/2)*this.hitPad*s) + (my*my)/sq((eyeH/2)*this.hitPad*s) <= 1;

    let targetBlink = autoBlink(millis(), this.blinkPeriod, this.blinkDuration);
    if (insideEye) targetBlink = 1;
    this.blinkAmt = lerp(this.blinkAmt, targetBlink, this.blinkEase);
    const easedLid = easeInOutCubic(constrain(this.blinkAmt, 0, 1));

    const maxOffset = eyeH * 0.18 * s;
    let tx = mx, ty = my;
    const mLen = sqrt(tx*tx + ty*ty);
    if (mLen > maxOffset && mLen > 0) { const k = maxOffset / mLen; tx *= k; ty *= k; }
    this.eyeCX = lerp(this.eyeCX, tx, this.moveEase);
    this.eyeCY = lerp(this.eyeCY, ty, this.moveEase);

    push();
    translate(x, y); scale(s);

    withEyeClip(eyeW, eyeH, () => {
      push(); colorMode(HSB, 360, 100, 100, 1);
      push(); translate(this.eyeCX, this.eyeCY);
      this.drawFraserTilesField(eyeW, eyeH, pupilR, this.FRASER, 0.65, 0.60);
      pop();

      push(); translate(this.eyeCX, this.eyeCY);
      this.withCircleClip(0, 0, pupilR * 1.005, () => {
        this.drawFraserTilesField(pupilR*2.2, pupilR*2.2, 0, this.FRASER_PUPIL, 1.10, 0.0);
      });
      pop();

      if (this.SHOW_PUPIL_STROKE) {
        noFill(); stroke(0, 0, 85, 1); strokeWeight(1.2);
        push(); translate(this.eyeCX, this.eyeCY); circle(0, 0, pupilR * 2); pop();
      }

      drawTopLidRectSlit(eyeW, eyeH, easedLid, color(278, 77, 76, 1), this.SLIT_FRACTION);

      const yEdge = lidEdgeY(eyeH, easedLid, this.SLIT_FRACTION);
      const ctx = drawingContext;
      ctx.save();
      ctx.beginPath();
      ctx.rect(-eyeW/2 - 2, -eyeH, eyeW + 4, yEdge + eyeH);
      ctx.clip();

      fill(255); noStroke(); textAlign(CENTER, CENTER);
      textSize(eyeH * 0.14);
      text("REFLECTOR", 0, -eyeH * 0.05);
      ctx.restore();

      pop(); // restore color mode
    });

    stroke(255); strokeWeight(OUTLINE_STROKE_W); noFill();
    drawEyeOutline(eyeW, eyeH);

    pop();
  }

  drawFraserTilesField(bboxW, bboxH, innerRadius, cfg, coverFactor, innerFactor) {
    const maxR  = min(bboxW, bboxH) * (coverFactor || 0.95);
    const rStep = cfg.rStep, aStep = cfg.aStep;
    const t = millis() * 0.001, rot = cfg.omega * t;
    const startR = max(innerRadius * (innerFactor || 0.60), 0);

    for (let r = startR; r <= maxR; r += rStep) {
      const r2 = min(r + rStep, maxR), rMid = (r + r2) * 0.5;
      for (let a0 = 0; a0 < TWO_PI; a0 += aStep) {
        const a1 = a0 + aStep, aMid = (a0 + a1) * 0.5;
        const p = cfg.m * (aMid + rot) + cfg.k * rMid, s = sin(p);
        const bands = max(2, floor(cfg.bands));
        let idx = floor((0.5 + 0.5 * s) * bands); if (idx >= bands) idx = bands - 1;
        const hue = (cfg.hueBase + (cfg.hueSpan * idx / (bands - 1))) % 360;
        const bri = lerp(cfg.briLo, cfg.briHi, 0.5 + 0.5*s);
        fill(hue, cfg.sat, bri, cfg.alpha);

        const erx = cos(aMid), ery = sin(aMid), etx = -sin(aMid), ety = cos(aMid);
        const hr = (r2 - r) * 0.5 * cfg.expand, ht = (a1 - a0) * rMid * 0.5 * cfg.expand;
        const c = cos(cfg.tilt), sT = sin(cfg.tilt);
        const ux =  c*erx + sT*etx, uy =  c*ery + sT*ety;
        const vx = -sT*erx + c*etx, vy = -sT*ery + c*ety;
        const px = erx * rMid, py = ery * rMid;

        beginShape();
        vertex(px + ux * hr, py + uy * hr);
        vertex(px + vx * ht, py + vy * ht);
        vertex(px - ux * hr, py - uy * hr);
        vertex(px - vx * ht, py - vy * ht);
        endShape(CLOSE);
      }
    }
  }
  withCircleClip(cx, cy, r, drawFn) {
    const ctx = drawingContext;
    ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, r, 0, TWO_PI, false);
    ctx.closePath(); ctx.clip(); drawFn(); ctx.restore();
  }
}
function drawTriangleFlicker(a, b, c) {
  const t = millis() * 0.001;

  const PERIOD = 7.0;
  const ACTIVE = .70;
  const PULSES = 2;
  const m = t % PERIOD;

  const baseRGB   = [0x7D, 0x7D, 0x7D];
  const brightRGB = [0x9B, 0x9B, 0x9B];

  const easeInOutSine = (x) => 0.5 - 0.5 * Math.cos(Math.PI * x);
  const mix = (a, b, u) => a + (b - a) * u;

  let e = 0.0;

  if (m < ACTIVE) {
    const pulseDur = ACTIVE / (PULSES * 2);
    const centers = [ACTIVE * (1/6), ACTIVE * (3/6), ACTIVE * (5/6)];

    let eMax = 0;
    for (let cIdx = 0; cIdx < centers.length; cIdx++) {
      const cT = centers[cIdx];
      const d = Math.abs(m - cT);
      if (d <= pulseDur) {
        const u = 1 - (d / pulseDur);
        eMax = Math.max(eMax, easeInOutSine(u));
      }
    }
    e = eMax;
  }

  const rr = Math.round(mix(baseRGB[0], brightRGB[0], e));
  const gg = Math.round(mix(baseRGB[1], brightRGB[1], e));
  const bb = Math.round(mix(baseRGB[2], brightRGB[2], e));

  if (e > 0.001) {
    push();
    blendMode(ADD);
    noFill();
    stroke(rr, gg, bb, 10 * e * e);
    strokeWeight(7);
    triangle(a.x, a.y, b.x, b.y, c.x, c.y);
    pop();
  }

  noFill();
  stroke(rr, gg, bb, 45 + 50 * e);
  strokeWeight(1.5);
  triangle(a.x, a.y, b.x, b.y, c.x, c.y);
}

document.addEventListener('DOMContentLoaded', function() {
    const navLinks = document.querySelectorAll('.nav-link');
    const marqueeLinks = document.querySelectorAll('.marquee-link');
    
    // Handle regular nav links
    navLinks.forEach(link => {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            const targetId = this.getAttribute('href');
            if (targetId.startsWith('#')) {
                const targetElement = document.querySelector(targetId);
                if (targetElement) {
                    targetElement.scrollIntoView({
                        behavior: 'smooth',
                        block: 'start'
                    });
                }
            }
        });
    });
    
    // Handle marquee nav links
    marqueeLinks.forEach(link => {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            const targetId = this.getAttribute('href');
            if (targetId.startsWith('#')) {
                const targetElement = document.querySelector(targetId);
                if (targetElement) {
                    targetElement.scrollIntoView({
                        behavior: 'smooth',
                        block: 'start'
                    });
                }
            }
        });
    });
    
    const observerOptions = {
        threshold: 0.1,
        rootMargin: '0px 0px -50px 0px'
    };
    
    const observer = new IntersectionObserver(function(entries) {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('visible');
            }
        });
    }, observerOptions);
    
    const articleElements = document.querySelectorAll('.article-body p, .article-body h2, blockquote');
    articleElements.forEach(el => {
        el.classList.add('fade-in');
        observer.observe(el);
    });
    
    const shareBtn = document.querySelector('.share-btn');
    if (shareBtn) {
        shareBtn.addEventListener('click', function() {
            if (navigator.share) {
                navigator.share({
                    title: document.title,
                    text: document.querySelector('.hero-subtitle').textContent,
                    url: window.location.href
                });
            } else {
                navigator.clipboard.writeText(window.location.href).then(() => {
                    this.textContent = 'Copied!';
                    setTimeout(() => {
                        this.textContent = 'Share';
                    }, 2000);
                });
            }
        });
    }
    
    // Scroll tracking variables for marquee navigation
    let lastScrollY = 0;
    let isScrollingDown = false;
    let scrollTimeout;
    
    window.addEventListener('scroll', function() {
        const scrolled = window.pageYOffset;
        const hero = document.querySelector('.hero');
        const heroIllustration = document.querySelector('.hero-illustration');
        const body = document.body;
        const navbar = document.querySelector('.navbar');
        const marqueeNav = document.querySelector('.marquee-nav');
        
        // Determine scroll direction
        isScrollingDown = scrolled > lastScrollY;
        lastScrollY = scrolled;
        
        // Clear existing timeout
        clearTimeout(scrollTimeout);
        
        if (hero && heroIllustration) {
            const rate = scrolled * -0.3;
            heroIllustration.style.transform = `translate(-50%, calc(-50% + ${rate}px))`;
        }
        
        // Navbar scroll behavior: visible on landing, disappears after 15% scroll, reappears on any 5px scroll up
        if (navbar) {
            const scrollPercentage = (scrolled / (document.documentElement.scrollHeight - window.innerHeight)) * 100;
            const scrollDifference = lastScrollY - scrolled;
            const isScrollingUp = scrollDifference >= 5; // Show if scrolled up by 5px or more
            
            // Show navbar if at top (0% scroll), within first 15%, or scrolling up by 5px+
            if (scrolled === 0 || scrollPercentage < 15 || isScrollingUp) {
                navbar.classList.add('visible');
            } else {
                navbar.classList.remove('visible');
            }
            
            lastScrollY = scrolled;
        }
        
        // Marquee navigation logic
        if (marqueeNav) {
            const windowHeight = window.innerHeight;
            const documentHeight = document.documentElement.scrollHeight - windowHeight;
            const scrollProgress = Math.min(scrolled / documentHeight, 1);
            
            // Show marquee when scrolling up at any point, or when at the top
            if (scrolled <= 50) {
                marqueeNav.classList.add('visible');
            } else if (isScrollingDown && scrollProgress > 0.25) {
                // Hide when scrolling down and past 25% of the page
                marqueeNav.classList.remove('visible');
            } else if (!isScrollingDown) {
                // Show when scrolling up at any point
                marqueeNav.classList.add('visible');
            }
            
            // Add a small delay to prevent flickering
            scrollTimeout = setTimeout(() => {
                if (isScrollingDown && scrollProgress > 0.25) {
                    marqueeNav.classList.remove('visible');
                }
            }, 150);
        }
        
        const windowHeight = window.innerHeight;
        const documentHeight = document.documentElement.scrollHeight - windowHeight;
        const scrollProgress = Math.min(scrolled / documentHeight, 1);
        
        const purpleR = 213;
        const purpleG = 85;
        const purpleB = 238;
        const opacity = scrollProgress * 0.36;
        
        // Background gradient removed - keeping clean white background
        // body.style.background = `linear-gradient(180deg, #000 0%, ${gradientColor} 100%)`;
    });
    
    const loadingElements = document.querySelectorAll('.related-item');
    loadingElements.forEach((el, index) => {
        el.style.opacity = '0';
        el.style.transform = 'translateY(30px)';
        
        setTimeout(() => {
            el.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
            el.style.opacity = '1';
            el.style.transform = 'translateY(0)';
        }, index * 200);
    });
    
    const relatedItems = document.querySelectorAll('.related-item');
    relatedItems.forEach(item => {
        item.addEventListener('mouseenter', function() {
            this.style.transform = 'translateY(-5px) scale(1.02)';
        });
        
        item.addEventListener('mouseleave', function() {
            this.style.transform = 'translateY(0) scale(1)';
        });
    });
    
    
    document.addEventListener('mousemove', function(e) {
        const heroIllustration = document.querySelector('#p5-hero');
        if (heroIllustration) {
            const rect = heroIllustration.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            
            if (typeof mouseX !== 'undefined') {
                mouseX = x;
                mouseY = y;
            }
        }
    });
    
    // Progress bar removed as requested
});

function addInteractiveFeatures() {
    document.addEventListener('click', function(e) {
        const heroIllustration = document.querySelector('#p5-hero');
        if (heroIllustration && heroIllustration.contains(e.target)) {
            const ripple = document.createElement('div');
            ripple.style.cssText = `
                position: absolute;
                border-radius: 50%;
                background: rgba(255, 255, 255, 0.3);
                transform: scale(0);
                animation: ripple 0.6s linear;
                pointer-events: none;
            `;
            
            const rect = heroIllustration.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            
            ripple.style.left = x + 'px';
            ripple.style.top = y + 'px';
            ripple.style.width = '20px';
            ripple.style.height = '20px';
            ripple.style.marginLeft = '-10px';
            ripple.style.marginTop = '-10px';
            
            heroIllustration.appendChild(ripple);
            
            setTimeout(() => {
                ripple.remove();
            }, 600);
        }
    });
    
    const style = document.createElement('style');
    style.textContent = `
        @keyframes ripple {
            to {
                transform: scale(4);
                opacity: 0;
            }
        }
    `;
    document.head.appendChild(style);
}

addInteractiveFeatures();

let projectorEyeSketch = function(p) {
  let projectorEye;
  
  p.setup = function() {
    let canvas = p.createCanvas(1200, 900);
    canvas.parent('p5-projector-eye');
    p.angleMode(p.RADIANS);
    p.textAlign(p.CENTER, p.CENTER);
    p.noStroke();
    p.colorMode(p.RGB, 255, 255, 255, 255);
    p.textFont("Inter, helvetica, sans-serif");
    
    projectorEye = new ProjectorEye(p);
  };
  
  p.draw = function() {
    p.background(0, 0, 0, 0); // Transparent background
    
    const centerX = p.width / 2;
    const centerY = p.height / 2;
    const scale = 2.5; // Scale up the eye even more for dramatic effect
    
    projectorEye.drawAt(centerX, centerY, scale);
  };
};

class ProjectorEye {
  constructor(p) {
    this.p = p;
    this.blinkPeriod = 8000; 
    this.blinkDuration = 650;
    this.blinkEase = 0.22;   
    this.moveEase = 0.14;
    this.hitPad = 1.08;      
    this.SLIT_FRACTION = 0.04;
    this.blinkAmt = 0; 
    this.eyeCX = 0; 
    this.eyeCY = 0;
    this.base = 400; // Larger base size for dramatic effect
    this.GRIDCFG = {
      color: { r:209, g:0, b:239 },
      alphaGlow: 0.08, alphaMid: 0.18, alphaCore: 0.55,
      lengthScale: 1.25, nVertical: 24, nHorizontal: 37,
      perspGamma: 2.0, speed: 0.40
    };
  }
  
  isHovered(mxAbs, myAbs, s = 1) {
    const eyeW = this.base, eyeH = this.base * 0.52;
    if (!this._lastPos) return false;
    const dx = mxAbs - this._lastPos.x, dy = myAbs - this._lastPos.y;
    return (dx*dx)/this.p.sq((eyeW/2)*this.hitPad*s) + (dy*dy)/this.p.sq((eyeH/2)*this.hitPad*s) <= 1;
  }
  
  drawAt(x, y, s = 1) {
    this._lastPos = {x, y};
    const eyeW = this.base, eyeH = this.base * 0.52;
    const pupilR = eyeH * 0.24;

    const scrollY = window.scrollY || window.pageYOffset;
    const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
    const scrollProgress = Math.min(scrollY / maxScroll, 1);
    
    const maxOffset = eyeH * 0.15 * s;
    const tx = 0;
    const ty = (scrollProgress - 0.5) * maxOffset * 2;
    
    this.eyeCX = this.p.lerp(this.eyeCX, tx, this.moveEase);
    this.eyeCY = this.p.lerp(this.eyeCY, ty, this.moveEase);

    this.p.push();
    this.p.translate(x, y); this.p.scale(s);

    this.p.push(); this.p.colorMode(this.p.RGB, 255, 255, 255, 1);
    this.withEyeClip(eyeW, eyeH, () => {
      this.p.push(); this.p.translate(this.eyeCX, this.eyeCY);
      this.drawAllFourWedges(eyeW, eyeH, { reverse:false, scale:.1, density:0.13 });

      this.p.push();
      const ctx = this.p.drawingContext;
      ctx.save(); ctx.beginPath(); ctx.arc(0, 0, pupilR, 0, this.p.TWO_PI); ctx.clip();
      this.drawAllFourWedges(eyeW, eyeH, { reverse:true, scale:0.65, density:0.3 });
      ctx.restore();
      this.p.noFill(); this.p.stroke(220); this.p.strokeWeight(1.4); this.p.circle(0, 0, pupilR * 2);
      this.p.pop();

 removed
      // this.drawTopLidRectSlit(eyeW, eyeH, easedLid, this.p.color(134, 29, 194), this.SLIT_FRACTION);

      // const yEdge = this.lidEdgeY(eyeH, easedLid, this.SLIT_FRACTION);
      // const ctx2 = this.p.drawingContext;
      // ctx2.save();
      // ctx2.beginPath();
      // ctx2.rect(-eyeW/2 - 2, -eyeH, eyeW + 4, yEdge + eyeH);
      // ctx2.clip();

      // this.p.fill(255); this.p.noStroke(); this.p.textAlign(this.p.CENTER, this.p.CENTER);
      // this.p.textSize(eyeH * 0.14);
      // this.p.text("PROJECTOR", 0, -eyeH * 0.05);
      // ctx2.restore();
      this.p.pop();
    });
    this.p.pop(); // restore colorMode

    this.p.stroke(255); this.p.strokeWeight(1.5); this.p.noFill();
    this.drawEyeOutline(eyeW, eyeH);

    this.p.pop();
  }

  drawAllFourWedges(eyeW, eyeH, options) {
    const reverse = !!options.reverse;
    const scale = (options.scale == null) ? 1.0 : options.scale;
    const density = (options.density == null) ? 1.0 : options.density;
    const L = this.p.max(eyeW, eyeH) * this.GRIDCFG.lengthScale * scale;
    const t = this.p.millis() * 0.001;
    const cycle = t * this.GRIDCFG.speed * (reverse ? -1 : 1);

    const right = this.p.createVector(1, 0), left = this.p.createVector(-1, 0);
    const up = this.p.createVector(0, -1), down = this.p.createVector(0, 1);

    this.drawWedgeGrid(right, up,   L, cycle, density);
    this.drawWedgeGrid(right, down, L, cycle, density);
    this.drawWedgeGrid(left,  down, L, cycle, density);
    this.drawWedgeGrid(left,  up,   L, cycle, density);
  }
  
  drawWedgeGrid(dirA, dirB, L, cycle, density = 1.0) {
    dirA = dirA.copy().normalize(); dirB = dirB.copy().normalize();
    const farA = p5.Vector.mult(dirA, L), farB = p5.Vector.mult(dirB, L);

    const nVertical = Math.floor(this.GRIDCFG.nVertical * density);
    for (let i = 0; i <= nVertical; i++) {
      const v = i / nVertical;
      const edgePoint = p5.Vector.lerp(farA, farB, v);
      this.drawGlowLine(0, 0, edgePoint.x, edgePoint.y);
    }
    const nHorizontal = Math.floor(this.GRIDCFG.nHorizontal * density);
    const total = nHorizontal + 8;
    for (let k = -4; k < total - 4; k++) {
      const f = this.frac((k + cycle) / nHorizontal);
      const tt = 1 - this.p.pow(1 - f, this.GRIDCFG.perspGamma);
      const pA = p5.Vector.mult(dirA, tt * L), pB = p5.Vector.mult(dirB, tt * L);
      this.drawGlowSegment(pA.x, pA.y, pB.x, pB.y);
    }
  }
  
  drawGlowLine(x1, y1, x2, y2) {
    const c = this.GRIDCFG.color;
    this.p.stroke(c.r, c.g, c.b, this.GRIDCFG.alphaGlow); this.p.strokeWeight(5.5); this.p.line(x1, y1, x2, y2);
    this.p.stroke(c.r, c.g, c.b, this.GRIDCFG.alphaMid ); this.p.strokeWeight(3.0); this.p.line(x1, y1, x2, y2);
    this.p.stroke(c.r, c.g, c.b, this.GRIDCFG.alphaCore); this.p.strokeWeight(1.6); this.p.line(x1, y1, x2, y2);
  }
  
  drawGlowSegment(x1, y1, x2, y2){ this.drawGlowLine(x1, y1, x2, y2); }
  frac(x){ return x - this.p.floor(x); }
  
  autoBlink(nowMs, periodMs, durMs) {
    const t = nowMs % periodMs;
    if (t < durMs) return t / durMs;
    if (t > periodMs - durMs) return (periodMs - t) / durMs;
    return 0;
  }
  
  easeInOutCubic(x){ return x < 0.5 ? 4*x*x*x : 1 - this.p.pow(-2*x + 2, 3)/2; }
  
  withEyeClip(eyeW, eyeH, drawFn) {
    const w = eyeW, h = eyeH;
    const L = -w / 2, R = w / 2;
    const ctx = this.p.drawingContext;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(L, 0);
    ctx.bezierCurveTo(L + w * 0.25, -h * 0.55, R - w * 0.25, -h * 0.55, R, 0);
    ctx.bezierCurveTo(R - w * 0.25,  h * 0.55, L + w * 0.25,  h * 0.55, L, 0);
    ctx.closePath();
    ctx.clip();
    drawFn();
    ctx.restore();
  }
  
  drawEyeOutline(eyeW, eyeH) {
    const w = eyeW, h = eyeH;
    const L = -w / 2, R = w / 2;
    this.p.beginShape();
    this.p.vertex(L, 0);
    this.p.bezierVertex(L + w * 0.25, -h * 0.55, R - w * 0.25, -h * 0.55, R, 0);
    this.p.bezierVertex(R - w * 0.25,  h * 0.55, L + w * 0.25,  h * 0.55, L, 0);
    this.p.endShape(this.p.CLOSE);
  }
  
  drawTopLidRectSlit(eyeW, eyeH, blinkAmt, fillCol, SLIT_FRACTION = 0.04) {
    if (blinkAmt <= 0.0001) return;
    const w = eyeW, h = eyeH;
    const L = -w / 2, R = w / 2;
    const yEdge = this.lidEdgeY(h, blinkAmt, SLIT_FRACTION);
    this.p.noStroke(); this.p.fill(fillCol);
    this.p.rectMode(this.p.CORNERS);
    this.p.rect(L - 400, -this.p.height, R + 400, yEdge); // clipped by withEyeClip
  }
  
  lidEdgeY(eyeH, blinkAmt, SLIT_FRACTION = 0.04) {
    const bottomY = this.bottomMidY(eyeH);
    const slitPx  = eyeH * SLIT_FRACTION;
    const closedY = bottomY - slitPx;
    const openY   = -eyeH * 0.65;
    return this.p.lerp(openY, closedY, this.p.constrain(blinkAmt, 0, 1));
  }
  
  bottomMidY(h){
    const p0 = 0, p1 =  h*0.55, p2 =  h*0.55, p3 = 0;
    const u = 0.5, uu = (1 - u);
    return uu*uu*uu*p0 + 3*uu*uu*u*p1 + 3*uu*u*u*p2 + u*u*u*p3;
  }
}

document.addEventListener('DOMContentLoaded', function() {
    setTimeout(() => {
        if (document.getElementById('p5-projector-eye')) {
            new p5(projectorEyeSketch);
        }
    }, 100);
});
