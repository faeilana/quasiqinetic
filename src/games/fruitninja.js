// Web port of Devin's Python Fruit Ninja (fruitninja/screen.py + fruit.py)
// Camera integration: MediaPipe wrist landmarks drive slicing (left=cyan trail, right=orange trail).
// Mouse/touch slicing remains active as fallback or secondary input.

import { createPoseTracker, startWebcam, LM } from '../poseTracker.js';

const SCREEN_W        = 1000;
const SCREEN_H        = 650;
const GRAVITY         = 900;
const SPAWN_INTERVAL  = 0.9;
const MIN_LAUNCH      = 700;
const MAX_LAUNCH      = 950;
const FRUIT_RADIUS    = 34;
const MAX_MISSES      = 3;
const TRAIL_LENGTH    = 18;
const STORAGE_KEY     = 'fruitninja-sessions';
const WRIST_MIN_MOVE  = 5;  // min px movement in game coords to register a wrist slice
const WRIST_INTERP    = 10; // interpolation steps per segment (more = fewer missed fruits)
const SPEED_BONUS_R   = 0.6;// extra hit radius per px/frame of wrist speed (max +18px)
const TRAIL_FADE_MS   = 250;// trail point lifetime in ms (time-based, not frame-based)

const THEME = {
  skyTop:    [28,  16,  40],
  skyBottom: [70,  30,  60],
  accent:    [255, 120, 90],
  ground:    [24,  14,  30],
};

// Matches fruitninja/settings.py FRUITS list exactly
const FRUITS = [
  { name: 'watermelon', color: [54,  160, 70],  hl: [120, 210, 120] },
  { name: 'orange',     color: [255, 150, 40],  hl: [255, 200, 120] },
  { name: 'apple',      color: [220, 50,  50],  hl: [255, 120, 120] },
  { name: 'lemon',      color: [240, 220, 60],  hl: [255, 245, 150] },
  { name: 'blueberry',  color: [70,  90,  220], hl: [140, 160, 255] },
];

// ── Canvas ───────────────────────────────────────────────────────────────────
const canvas   = document.getElementById('game-canvas');
const ctx      = canvas.getContext('2d');
const videoEl  = document.getElementById('webcam');
const overlayEl= document.getElementById('overlay');
const statusEl = document.getElementById('status');
canvas.width   = SCREEN_W;
canvas.height  = SCREEN_H;

function fitCanvas() {
  const ratio = SCREEN_W / SCREEN_H;
  let w = window.innerWidth, h = w / ratio;
  if (h > window.innerHeight * 0.9) { h = window.innerHeight * 0.9; w = h * ratio; }
  canvas.style.width  = `${w}px`;
  canvas.style.height = `${h}px`;
}
fitCanvas();
window.addEventListener('resize', fitCanvas);

function setStatus(msg, cls = '') {
  statusEl.textContent = msg;
  statusEl.className = cls;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const rgb  = (a) => `rgb(${a[0]},${a[1]},${a[2]})`;
const rnd  = (lo, hi) => Math.random() * (hi - lo) + lo;
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

function toCanvas(e) {
  const r  = canvas.getBoundingClientRect();
  const sx = SCREEN_W / r.width, sy = SCREEN_H / r.height;
  const src = e.touches ? e.touches[0] : e;
  return [(src.clientX - r.left) * sx, (src.clientY - r.top) * sy];
}

function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// Map normalized wrist landmark (0–1) → game canvas coords.
// Flip x because the camera video is displayed mirrored (transform: scaleX(-1)).
function wristToGame(lm) {
  return [(1 - lm.x) * SCREEN_W, lm.y * SCREEN_H];
}

// ── Fruit ─────────────────────────────────────────────────────────────────────
class Fruit {
  constructor() {
    const f    = pick(FRUITS);
    this.x     = rnd(120, SCREEN_W - 120);
    this.y     = SCREEN_H + FRUIT_RADIUS;
    this.vx    = rnd(-120, 120);
    this.vy    = -rnd(MIN_LAUNCH, MAX_LAUNCH);
    this.color = f.color;
    this.hl    = f.hl;
    this.angle = 0;
    this.spin  = rnd(-3, 3);
    this.sliced = false;
  }

  update(dt) {
    this.vy    += GRAVITY * dt;
    this.x     += this.vx * dt;
    this.y     += this.vy * dt;
    this.angle += this.spin * dt;
  }

  contains(px, py) {
    return Math.hypot(px - this.x, py - this.y) <= FRUIT_RADIUS;
  }

  isOffBottom() {
    return this.y - FRUIT_RADIUS > SCREEN_H;
  }

  draw() {
    ctx.beginPath();
    ctx.arc(this.x, this.y, FRUIT_RADIUS, 0, Math.PI * 2);
    ctx.fillStyle = rgb(this.color);
    ctx.fill();

    const off = FRUIT_RADIUS * 0.35;
    const hx  = this.x - off * Math.cos(this.angle);
    const hy  = this.y - off * Math.sin(this.angle);
    ctx.beginPath();
    ctx.arc(hx, hy, Math.max(4, FRUIT_RADIUS / 4), 0, Math.PI * 2);
    ctx.fillStyle = rgb(this.hl);
    ctx.fill();

    if (this.sliced) {
      ctx.strokeStyle = 'white';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(this.x - FRUIT_RADIUS, this.y);
      ctx.lineTo(this.x + FRUIT_RADIUS, this.y);
      ctx.stroke();
    }
  }
}

// ── Splat ─────────────────────────────────────────────────────────────────────
class Splat {
  constructor(x, y, color) {
    const speed = rnd(120, 320);
    const ang   = rnd(0, Math.PI * 2);
    this.x     = x;
    this.y     = y;
    this.vx    = speed * Math.cos(ang);
    this.vy    = -Math.abs(speed) * rnd(0.3, 1.0);
    this.color = color;
    this.life  = 0.6;
    this.maxLife = 0.6;
  }

  update(dt) {
    this.vy += 900 * dt;
    this.x  += this.vx * dt;
    this.y  += this.vy * dt;
    this.life -= dt;
  }

  draw() {
    if (this.life <= 0) return;
    const r = Math.max(2, 6 * (this.life / this.maxLife));
    ctx.beginPath();
    ctx.arc(this.x, this.y, r, 0, Math.PI * 2);
    ctx.fillStyle = rgb(this.color);
    ctx.fill();
  }
}

// ── Game state ────────────────────────────────────────────────────────────────
let fruits = [], splats = [];
let mouseTrail = [];             // white trail for mouse
let leftTrail  = [], rightTrail = []; // cyan/orange trails for wrists
let score, misses, spawnTimer, gameOver, startTime, mouseSlicing;

// Camera state
let leftPrev  = null; // previous [x,y] of left wrist in game coords
let rightPrev = null;
let leftTarget  = null; // latest target for interpolation
let rightTarget = null;
let cameraActive = false;
let lastPoseTime = 0;

function reset() {
  fruits = []; splats = [];
  mouseTrail = []; leftTrail = []; rightTrail = [];
  leftPrev = null; rightPrev = null;
  score = 0; misses = 0; spawnTimer = 0;
  gameOver = false; mouseSlicing = false;
  startTime = Date.now();
}
reset();

// ── Session save ──────────────────────────────────────────────────────────────
function saveSession() {
  const endTime   = Date.now();
  const durationS = (endTime - startTime) / 1000;
  const calories  = Math.round(4 * 65 / 3600 * durationS * 100) / 100;
  const session   = { game_id: 'fruitninja', startTime, endTime, score, misses, calories };
  try {
    const list = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
    list.unshift(session);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list.slice(0, 20)));
  } catch {}
}

// ── Slice helpers ─────────────────────────────────────────────────────────────
function checkFruitsAt(px, py) {
  checkFruitsAtRadius(px, py, FRUIT_RADIUS);
}

function checkFruitsAtRadius(px, py, radius) {
  if (gameOver) return;
  for (const f of fruits) {
    if (!f.sliced && Math.hypot(px - f.x, py - f.y) <= radius) {
      f.sliced = true;
      score++;
      for (let i = 0; i < 10; i++) splats.push(new Splat(f.x, f.y, f.hl));
    }
  }
}

// Mouse/touch: add to white trail + check fruits
function mouseSliceAt(px, py) {
  mouseTrail.push([px, py, performance.now()]);
  if (mouseTrail.length > TRAIL_LENGTH) mouseTrail.shift();
  checkFruitsAt(px, py);
}

// Wrist: interpolate points along segment for reliable hit detection
// Uses speed-expanded radius so fast slashes have a wider hitbox
function wristSliceSegment(x0, y0, x1, y1, trailArr) {
  const dist  = Math.hypot(x1 - x0, y1 - y0);
  const steps = WRIST_INTERP;
  const bonus = Math.min(18, dist * SPEED_BONUS_R);
  const now   = performance.now();
  for (let i = 0; i <= steps; i++) {
    const t  = i / steps;
    const px = x0 + (x1 - x0) * t;
    const py = y0 + (y1 - y0) * t;
    trailArr.push([px, py, now]);
    if (trailArr.length > TRAIL_LENGTH) trailArr.shift();
    checkFruitsAtRadius(px, py, FRUIT_RADIUS + bonus);
  }
}

// ── Pose callback (called by MediaPipe at ~30 fps) ────────────────────────────
function onPoseResult(landmarks) {
  lastPoseTime = performance.now();
  const lw = landmarks[LM.LEFT_WRIST];
  const rw = landmarks[LM.RIGHT_WRIST];

  // Left wrist (cyan trail)
  if (lw && (lw.visibility ?? 0) > 0.4) {
    const [nx, ny] = wristToGame(lw);
    if (leftPrev) {
      const d = Math.hypot(nx - leftPrev[0], ny - leftPrev[1]);
      if (d > WRIST_MIN_MOVE && !gameOver) {
        wristSliceSegment(leftPrev[0], leftPrev[1], nx, ny, leftTrail);
      }
    }
    leftPrev = [nx, ny];
    leftTarget = [nx, ny];
  } else {
    leftPrev = null;
    leftTarget = null;
  }

  // Right wrist (orange trail)
  if (rw && (rw.visibility ?? 0) > 0.4) {
    const [nx, ny] = wristToGame(rw);
    if (rightPrev) {
      const d = Math.hypot(nx - rightPrev[0], ny - rightPrev[1]);
      if (d > WRIST_MIN_MOVE && !gameOver) {
        wristSliceSegment(rightPrev[0], rightPrev[1], nx, ny, rightTrail);
      }
    }
    rightPrev = [nx, ny];
    rightTarget = [nx, ny];
  } else {
    rightPrev = null;
    rightTarget = null;
  }
}

// ── Input: mouse / touch ──────────────────────────────────────────────────────
const BACK_BTN = { x: 24, y: 24, w: 130, h: 40 };
function inBackBtn(px, py) {
  return px >= BACK_BTN.x && px <= BACK_BTN.x + BACK_BTN.w &&
         py >= BACK_BTN.y && py <= BACK_BTN.y + BACK_BTN.h;
}

canvas.addEventListener('mousedown', (e) => {
  const [px, py] = toCanvas(e);
  if (inBackBtn(px, py)) { window.location.href = '/'; return; }
  if (gameOver) { reset(); return; }
  mouseSlicing = true;
  mouseSliceAt(px, py);
});
canvas.addEventListener('mousemove', (e) => {
  if (!mouseSlicing || gameOver) return;
  mouseSliceAt(...toCanvas(e));
});
canvas.addEventListener('mouseup',    () => { mouseSlicing = false; });
canvas.addEventListener('mouseleave', () => { mouseSlicing = false; });

canvas.addEventListener('touchstart', (e) => {
  e.preventDefault();
  const [px, py] = toCanvas(e);
  if (inBackBtn(px, py)) { window.location.href = '/'; return; }
  if (gameOver) { reset(); return; }
  mouseSlicing = true;
  mouseSliceAt(px, py);
}, { passive: false });
canvas.addEventListener('touchmove', (e) => {
  e.preventDefault();
  if (!mouseSlicing || gameOver) return;
  mouseSliceAt(...toCanvas(e));
}, { passive: false });
canvas.addEventListener('touchend', () => { mouseSlicing = false; });

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') window.location.href = '/';
  if (gameOver && (e.key === ' ' || e.key === 'Enter')) reset();
});

// ── Update ────────────────────────────────────────────────────────────────────
function update(dt) {
  // Fade mouse trail when not held
  if (!mouseSlicing && mouseTrail.length) mouseTrail.shift();
  // Fade wrist trails based on time (not per-frame shift)
  const now = performance.now();
  while (leftTrail.length  > 0 && (now - (leftTrail[0][2]  || 0)) > TRAIL_FADE_MS) leftTrail.shift();
  while (rightTrail.length > 0 && (now - (rightTrail[0][2] || 0)) > TRAIL_FADE_MS) rightTrail.shift();

  splats.forEach(s => s.update(dt));
  splats = splats.filter(s => s.life > 0);
  if (gameOver) return;

  spawnTimer += dt;
  if (spawnTimer >= SPAWN_INTERVAL) {
    spawnTimer -= SPAWN_INTERVAL;
    fruits.push(new Fruit());
  }

  fruits.forEach(f => f.update(dt));

  const keep = [];
  for (const f of fruits) {
    if (f.isOffBottom()) { if (!f.sliced) misses++; }
    else keep.push(f);
  }
  fruits = keep;

  if (misses >= MAX_MISSES) {
    gameOver = true;
    saveSession();
  }
}

// ── Draw ──────────────────────────────────────────────────────────────────────
function drawBg() {
  const g = ctx.createLinearGradient(0, 0, 0, SCREEN_H);
  g.addColorStop(0, rgb(THEME.skyTop));
  g.addColorStop(1, rgb(THEME.skyBottom));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);

  const groundY = SCREEN_H - 70;
  ctx.fillStyle = rgb(THEME.ground);
  ctx.fillRect(0, groundY, SCREEN_W, 70);
  ctx.strokeStyle = rgb(THEME.accent);
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(0, groundY);
  ctx.lineTo(SCREEN_W, groundY);
  ctx.stroke();
}

function drawTrailArr(trailArr, colorFn) {
  if (trailArr.length < 2) return;
  const n = trailArr.length;
  const now = performance.now();
  ctx.lineCap = 'round';
  for (let i = 1; i < n; i++) {
    const age   = now - (trailArr[i][2] || 0);
    const alpha = Math.max(0, 1 - age / TRAIL_FADE_MS);
    if (alpha <= 0) continue;
    ctx.strokeStyle = colorFn(alpha);
    ctx.lineWidth   = Math.max(1, Math.floor(8 * alpha));
    ctx.beginPath();
    ctx.moveTo(trailArr[i-1][0], trailArr[i-1][1]);
    ctx.lineTo(trailArr[i][0],   trailArr[i][1]);
    ctx.stroke();
  }
}

function drawHUD() {
  ctx.textAlign = 'center';
  ctx.fillStyle = 'white';
  ctx.font = 'bold 28px Inter, sans-serif';
  ctx.fillText('Fruit Ninja', SCREEN_W / 2, 40);

  ctx.textAlign = 'right';
  ctx.font = 'bold 20px Inter, sans-serif';
  ctx.fillStyle = 'white';
  ctx.fillText(`Score: ${score}`, SCREEN_W - 24, 38);
  ctx.fillStyle = rgb(THEME.accent);
  ctx.fillText(`Lives: ${MAX_MISSES - misses}`, SCREEN_W - 24, 64);

  // Camera mode indicator
  if (cameraActive) {
    ctx.textAlign = 'left';
    ctx.font = '11px Inter, sans-serif';
    ctx.fillStyle = 'rgba(109,255,179,0.9)';
    ctx.fillText('● CAMERA ON — slice with your hands', 200, 18);
  }

  ctx.textAlign = 'center';
  ctx.font = '13px Inter, sans-serif';
  ctx.fillStyle = 'rgba(235,235,235,0.6)';
  ctx.fillText('Drag mouse · or wave hands to slice   ·   ESC = dashboard', SCREEN_W / 2, SCREEN_H - 14);
}

function drawBackBtn() {
  const { x, y, w, h } = BACK_BTN;
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  roundRect(x, y, w, h, 8); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.6)';
  ctx.lineWidth = 2;
  roundRect(x, y, w, h, 8); ctx.stroke();
  ctx.fillStyle = 'white';
  ctx.font = '14px Inter, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('‹ Dashboard', x + w / 2, y + h / 2 + 5);
}

function drawGameOver() {
  ctx.fillStyle = 'rgba(0,0,0,0.67)';
  ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);

  ctx.textAlign = 'center';
  ctx.fillStyle = 'white';
  ctx.font = 'bold 48px Inter, sans-serif';
  ctx.fillText('Game Over', SCREEN_W / 2, SCREEN_H / 2 - 60);

  ctx.fillStyle = rgb(THEME.accent);
  ctx.font = 'bold 26px Inter, sans-serif';
  ctx.fillText(`Final score: ${score}`, SCREEN_W / 2, SCREEN_H / 2);

  ctx.fillStyle = 'white';
  ctx.font = '16px Inter, sans-serif';
  ctx.fillText('Click / wave hand / Space to play again   ·   ESC = dashboard', SCREEN_W / 2, SCREEN_H / 2 + 50);
}

function draw() {
  drawBg();
  fruits.forEach(f => f.draw());
  splats.forEach(s => s.draw());

  // Mouse trail — white
  drawTrailArr(mouseTrail, (a) => `rgba(255,255,255,${a})`);
  // Left wrist trail — cyan
  drawTrailArr(leftTrail,  (a) => `rgba(80,210,255,${a})`);
  // Right wrist trail — orange
  drawTrailArr(rightTrail, (a) => `rgba(255,160,50,${a})`);

  drawHUD();
  drawBackBtn();
  if (gameOver) drawGameOver();
}

// ── Loop ──────────────────────────────────────────────────────────────────────
let last = null;
function loop(ts) {
  if (last === null) last = ts;
  const dt = Math.min((ts - last) / 1000, 0.05);
  last = ts;
  update(dt);
  draw();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

// ── Camera boot (async — game already running with mouse while this loads) ────
async function initCamera() {
  try {
    setStatus('Requesting camera…');
    await startWebcam(videoEl);
    setStatus('Loading MediaPipe… (first load ~20 s)');
    await createPoseTracker(videoEl, overlayEl, (landmarks) => {
      cameraActive = true;
      onPoseResult(landmarks);
    }, (msg) => setStatus(msg));
    setStatus('Camera ready — wave your hands to slice!', 'ready');
  } catch (err) {
    setStatus(`Camera unavailable: ${err.message} — use mouse to play`, 'error');
    console.warn('[fruitninja] camera init failed:', err);
  }
}
initCamera();
