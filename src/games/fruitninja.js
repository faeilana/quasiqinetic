// Web port of Devin's Python Fruit Ninja (fruitninja/screen.py + fruit.py)
// Physics, spawn intervals, fruit colors, splat particles, trail — all match the Python original.

const SCREEN_W        = 1000;
const SCREEN_H        = 650;
const GRAVITY         = 900;       // px/s² — matches Python
const SPAWN_INTERVAL  = 0.9;       // seconds
const MIN_LAUNCH      = 700;       // px/s upward
const MAX_LAUNCH      = 950;
const FRUIT_RADIUS    = 34;
const MAX_MISSES      = 3;
const TRAIL_LENGTH    = 12;
const STORAGE_KEY     = 'fruitninja-sessions';

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
const canvas = document.getElementById('game-canvas');
const ctx    = canvas.getContext('2d');
canvas.width  = SCREEN_W;
canvas.height = SCREEN_H;

function fitCanvas() {
  const ratio = SCREEN_W / SCREEN_H;
  let w = window.innerWidth, h = window.innerWidth / ratio;
  if (h > window.innerHeight) { h = window.innerHeight; w = h * ratio; }
  canvas.style.width  = `${w}px`;
  canvas.style.height = `${h}px`;
}
fitCanvas();
window.addEventListener('resize', fitCanvas);

// ── Helpers ──────────────────────────────────────────────────────────────────
const rgb  = (a) => `rgb(${a[0]},${a[1]},${a[2]})`;
const rnd  = (lo, hi) => Math.random() * (hi - lo) + lo;
const pick = (arr)    => arr[Math.floor(Math.random() * arr.length)];

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

// ── Fruit class ───────────────────────────────────────────────────────────────
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
    // Body
    ctx.beginPath();
    ctx.arc(this.x, this.y, FRUIT_RADIUS, 0, Math.PI * 2);
    ctx.fillStyle = rgb(this.color);
    ctx.fill();

    // Highlight spot (offset + rotating for roundness effect)
    const off = FRUIT_RADIUS * 0.35;
    const hx  = this.x - off * Math.cos(this.angle);
    const hy  = this.y - off * Math.sin(this.angle);
    ctx.beginPath();
    ctx.arc(hx, hy, Math.max(4, FRUIT_RADIUS / 4), 0, Math.PI * 2);
    ctx.fillStyle = rgb(this.hl);
    ctx.fill();

    // Slice line
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

// ── Splat particle ───────────────────────────────────────────────────────────
class Splat {
  constructor(x, y, color) {
    const speed = rnd(120, 320);
    const ang   = rnd(0, Math.PI * 2);
    this.x      = x;
    this.y      = y;
    this.vx     = speed * Math.cos(ang);
    this.vy     = -Math.abs(speed) * rnd(0.3, 1.0);
    this.color  = color;
    this.life   = 0.6;
    this.maxLife= 0.6;
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

// ── Game state ───────────────────────────────────────────────────────────────
let fruits = [], splats = [], trail = [];
let score, misses, spawnTimer, gameOver, startTime, slicing;

function reset() {
  fruits = []; splats = []; trail = [];
  score = 0; misses = 0; spawnTimer = 0;
  gameOver = false; slicing = false;
  startTime = Date.now();
}
reset();

// ── Session save (localStorage, same format as Python JSON) ──────────────────
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

// ── Slice logic ───────────────────────────────────────────────────────────────
function sliceAt(px, py) {
  trail.push([px, py]);
  if (trail.length > TRAIL_LENGTH) trail.shift();
  for (const f of fruits) {
    if (!f.sliced && f.contains(px, py)) {
      f.sliced = true;
      score++;
      for (let i = 0; i < 10; i++) splats.push(new Splat(f.x, f.y, f.hl));
    }
  }
}

// ── Input ─────────────────────────────────────────────────────────────────────
const BACK_BTN = { x: 24, y: 24, w: 130, h: 40 };
function inBackBtn(px, py) {
  return px >= BACK_BTN.x && px <= BACK_BTN.x + BACK_BTN.w &&
         py >= BACK_BTN.y && py <= BACK_BTN.y + BACK_BTN.h;
}

canvas.addEventListener('mousedown', (e) => {
  const [px, py] = toCanvas(e);
  if (inBackBtn(px, py)) { window.location.href = '/dashboard.html'; return; }
  if (gameOver) { reset(); return; }
  slicing = true;
  sliceAt(px, py);
});
canvas.addEventListener('mousemove', (e) => {
  if (!slicing || gameOver) return;
  sliceAt(...toCanvas(e));
});
canvas.addEventListener('mouseup',    () => { slicing = false; });
canvas.addEventListener('mouseleave', () => { slicing = false; });

canvas.addEventListener('touchstart', (e) => {
  e.preventDefault();
  const [px, py] = toCanvas(e);
  if (inBackBtn(px, py)) { window.location.href = '/dashboard.html'; return; }
  if (gameOver) { reset(); return; }
  slicing = true;
  sliceAt(px, py);
}, { passive: false });
canvas.addEventListener('touchmove', (e) => {
  e.preventDefault();
  if (!slicing || gameOver) return;
  sliceAt(...toCanvas(e));
}, { passive: false });
canvas.addEventListener('touchend', () => { slicing = false; });

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') window.location.href = '/dashboard.html';
  if (gameOver && (e.key === ' ' || e.key === 'Enter')) reset();
});

// ── Update ────────────────────────────────────────────────────────────────────
function update(dt) {
  if (!slicing && trail.length) trail.shift();
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

// ── Draw ─────────────────────────────────────────────────────────────────────
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

function drawTrail() {
  if (trail.length < 2) return;
  const n = trail.length;
  ctx.lineCap = 'round';
  for (let i = 1; i < n; i++) {
    ctx.strokeStyle = `rgba(255,255,255,${i / n})`;
    ctx.lineWidth   = Math.max(1, Math.floor(8 * i / n));
    ctx.beginPath();
    ctx.moveTo(trail[i-1][0], trail[i-1][1]);
    ctx.lineTo(trail[i][0],   trail[i][1]);
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

  ctx.textAlign = 'center';
  ctx.font = '13px Inter, sans-serif';
  ctx.fillStyle = 'rgba(235,235,235,0.75)';
  ctx.fillText('Drag mouse to slice   ·   ESC for dashboard', SCREEN_W / 2, SCREEN_H - 14);
}

function drawBackBtn() {
  const { x, y, w, h } = BACK_BTN;
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  roundRect(x, y, w, h, 8);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.6)';
  ctx.lineWidth = 2;
  roundRect(x, y, w, h, 8);
  ctx.stroke();
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
  ctx.fillText('Click or press Space to play again   ·   ESC for dashboard', SCREEN_W / 2, SCREEN_H / 2 + 50);
}

function draw() {
  drawBg();
  fruits.forEach(f => f.draw());
  splats.forEach(s => s.draw());
  drawTrail();
  drawHUD();
  drawBackBtn();
  if (gameOver) drawGameOver();
}

// ── Loop ─────────────────────────────────────────────────────────────────────
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
