// Endless runner — 3 lane side-scroller driven by pose actions.
// Call update(action) each pose frame, render(ctx) each game frame.

export const CANVAS_W = 800;
export const CANVAS_H = 400;

const LANE_CY = [110, 200, 290]; // y-centre of each lane
const LANE_H  = 80;
const LANE_COUNT = 3;

const PLAYER_X  = 150;
const PLAYER_W  = 36;
const PLAYER_H  = 56;
const PLAYER_DUCK_H = 26;

const JUMP_FRAMES  = 38;
const JUMP_HEIGHT  = 52; // px above lane centre at peak
const LANE_SWITCH_FRAMES = 12;

const BASE_SPEED   = 4.5;
const SPEED_RAMP   = 0.0008; // per frame
const SPAWN_EVERY  = 85;     // frames between obstacle spawns
const MIN_GAP      = 280;    // min px between obstacles (same lane)

const OBSTACLE_W   = 48;
const INVINC_FRAMES = 80;

// ── Factory ──────────────────────────────────────────────────────────────────

export function createRunner() {
  let s = blank();

  function blank() {
    return {
      phase: "idle",   // idle | playing | dead
      score: 0,
      speed: BASE_SPEED,
      frame: 0,
      lives: 3,
      lane: 1,
      prevY: LANE_CY[1],
      laneT: 1,          // 0→1 lane-transition progress
      jumpT: 0,          // 0→1→0 jump arc progress
      jumping: false,
      ducking: false,
      invincF: 0,
      obstacles: [],
      bgX: 0,
    };
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  function start() { s = blank(); s.phase = "playing"; }

  function update(action) {
    if (s.phase === "dead") {
      if (action !== "idle" && action !== "calibrating") start();
      return;
    }
    if (s.phase !== "playing") return;

    // Reset duck each frame; applyAction will re-enable if still ducking.
    s.ducking = false;
    applyAction(action);

    s.frame++;
    s.score  = Math.floor(s.frame / 5);
    s.speed  = BASE_SPEED + s.frame * SPEED_RAMP;
    s.bgX    = (s.bgX - s.speed) % 60;

    // Lane transition
    if (s.laneT < 1) s.laneT = Math.min(1, s.laneT + 1 / LANE_SWITCH_FRAMES);

    // Jump arc
    if (s.jumping) {
      s.jumpT += 1 / JUMP_FRAMES;
      if (s.jumpT >= 1) { s.jumpT = 0; s.jumping = false; }
    }

    // Invincibility
    if (s.invincF > 0) s.invincF--;

    // Obstacles
    if (s.frame % SPAWN_EVERY === 0) maybeSpawn();
    for (const o of s.obstacles) o.x -= s.speed;
    s.obstacles = s.obstacles.filter(o => o.x + OBSTACLE_W > -20);

    checkCollisions();
  }

  function render(ctx) {
    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
    drawBg(ctx);
    drawLanes(ctx);
    drawObstacles(ctx);
    drawPlayer(ctx);
    drawScore(ctx);
    drawLives(ctx);
    if (s.phase === "dead")  drawOverlay(ctx, "GAME OVER",  `${s.score}m — any move to restart`);
    if (s.phase === "idle")  drawOverlay(ctx, "READY?",     "calibrating… stand still");
  }

  function getPhase()  { return s.phase; }
  function getScore()  { return s.score; }

  return { start, update, render, getPhase, getScore };

  // ── Internal ───────────────────────────────────────────────────────────────

  function applyAction(action) {
    switch (action) {
      case "jump":
        if (!s.jumping && s.laneT >= 1) { s.jumping = true; s.jumpT = 0; }
        break;
      case "duck":
        s.ducking = true;
        break;
      case "lean_left":
        if (s.lane > 0 && s.laneT >= 0.85) {
          s.prevY = playerCY(); s.lane--; s.laneT = 0;
        }
        break;
      case "lean_right":
        if (s.lane < LANE_COUNT - 1 && s.laneT >= 0.85) {
          s.prevY = playerCY(); s.lane++; s.laneT = 0;
        }
        break;
    }
  }

  function playerCY() {
    return lerp(s.prevY, LANE_CY[s.lane], easeOut(s.laneT));
  }

  function playerRect() {
    const h = s.ducking ? PLAYER_DUCK_H : PLAYER_H;
    const cy = playerCY() + (s.jumping ? -Math.sin(s.jumpT * Math.PI) * JUMP_HEIGHT : 0);
    return { x: PLAYER_X, y: cy - h / 2, w: PLAYER_W, h };
  }

  function maybeSpawn() {
    const tooClose = s.obstacles.some(o => o.x > CANVAS_W - MIN_GAP);
    if (tooClose) return;
    const lane = Math.floor(Math.random() * LANE_COUNT);
    const low  = Math.random() < 0.55; // slightly more low (jump) obstacles
    const cy   = LANE_CY[lane];
    // Low obstacle height: tall enough that standing player (±28px) hits it.
    // High obstacle height: short enough that ducking player top (cy-13) clears it.
    //   Obstacle bottom = cy - LANE_H/2 + h must be ≤ cy - 14 → h ≤ 26. Use 24 for margin.
    const h = low ? LANE_H * 0.42 : 24;
    s.obstacles.push({
      lane, low,
      x: CANVAS_W + 20,
      y: low ? cy + LANE_H / 2 - h : cy - LANE_H / 2,
      h,
    });
  }

  function checkCollisions() {
    if (s.invincF > 0) return;
    const p = playerRect();
    for (const o of s.obstacles) {
      if (overlap(p, { x: o.x, y: o.y, w: OBSTACLE_W, h: o.h })) {
        s.lives--;
        s.invincF = INVINC_FRAMES;
        if (s.lives <= 0) s.phase = "dead";
        return;
      }
    }
  }

  // ── Drawing ────────────────────────────────────────────────────────────────

  function drawBg(ctx) {
    const g = ctx.createLinearGradient(0, 0, 0, CANVAS_H);
    g.addColorStop(0, "#080d18"); g.addColorStop(1, "#111827");
    ctx.fillStyle = g; ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    // Scrolling vertical grid
    ctx.strokeStyle = "rgba(50,90,180,0.12)"; ctx.lineWidth = 1;
    for (let x = ((s.bgX % 60) + 60) % 60; x < CANVAS_W; x += 60) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, CANVAS_H); ctx.stroke();
    }
  }

  function drawLanes(ctx) {
    for (let i = 0; i < LANE_COUNT; i++) {
      const cy    = LANE_CY[i];
      const top   = cy - LANE_H / 2;
      const active = i === s.lane;

      ctx.fillStyle = active ? "rgba(80,140,255,0.07)" : "rgba(255,255,255,0.02)";
      ctx.fillRect(0, top, CANVAS_W, LANE_H);

      // Border lines
      ctx.strokeStyle = active ? "rgba(120,170,255,0.45)" : "rgba(255,255,255,0.08)";
      ctx.lineWidth = active ? 1.5 : 1;
      ctx.beginPath(); ctx.moveTo(0, top); ctx.lineTo(CANVAS_W, top); ctx.stroke();
      if (i === LANE_COUNT - 1) {
        ctx.beginPath(); ctx.moveTo(0, cy + LANE_H / 2); ctx.lineTo(CANVAS_W, cy + LANE_H / 2); ctx.stroke();
      }

      // Dashed centre
      ctx.setLineDash([18, 22]);
      ctx.strokeStyle = "rgba(255,255,255,0.04)"; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(((s.bgX % 40) + 40) % 40, cy); ctx.lineTo(CANVAS_W, cy); ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  function drawObstacles(ctx) {
    for (const o of s.obstacles) {
      ctx.fillStyle  = o.low ? "#c0392b" : "#e67e22";
      ctx.strokeStyle = o.low ? "#ff7675" : "#fdcb6e";
      ctx.lineWidth  = 1.5;
      ctx.fillRect(o.x, o.y, OBSTACLE_W, o.h);
      ctx.strokeRect(o.x, o.y, OBSTACLE_W, o.h);
      ctx.fillStyle = "rgba(255,255,255,0.85)";
      ctx.font = "bold 9px monospace";
      ctx.textAlign = "center";
      ctx.fillText(o.low ? "JUMP" : "DUCK", o.x + OBSTACLE_W / 2, o.y + o.h / 2 + 3);
    }
  }

  function drawPlayer(ctx) {
    const p   = playerRect();
    const blink = s.invincF > 0 && Math.floor(s.invincF / 5) % 2 === 0;
    if (blink) return;

    const col = s.jumping ? "#74b9ff" : s.ducking ? "#ffeaa7" : "#a29bfe";
    ctx.fillStyle   = col;
    ctx.strokeStyle = "#fff";
    ctx.lineWidth   = 2;
    ctx.fillRect(p.x, p.y, p.w, p.h);
    ctx.strokeRect(p.x, p.y, p.w, p.h);

    // Eyes
    ctx.fillStyle = "#111";
    const eyeY = p.y + (s.ducking ? 5 : 10);
    ctx.fillRect(p.x + 6,  eyeY, 5, 5);
    ctx.fillRect(p.x + 22, eyeY, 5, 5);
  }

  function drawScore(ctx) {
    ctx.font = "bold 16px monospace"; ctx.fillStyle = "#a29bfe";
    ctx.textAlign = "right";
    ctx.fillText(`${s.score}m`, CANVAS_W - 12, 22);
  }

  function drawLives(ctx) {
    ctx.font = "15px monospace"; ctx.fillStyle = "#d63031";
    ctx.textAlign = "left";
    ctx.fillText("♥".repeat(s.lives) + "♡".repeat(3 - s.lives), 12, 22);
  }

  function drawOverlay(ctx, title, sub) {
    ctx.fillStyle = "rgba(0,0,0,0.68)";
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    ctx.fillStyle = "#fff"; ctx.font = "bold 32px monospace"; ctx.textAlign = "center";
    ctx.fillText(title, CANVAS_W / 2, CANVAS_H / 2 - 18);
    ctx.fillStyle = "#a0aec0"; ctx.font = "14px monospace";
    ctx.fillText(sub, CANVAS_W / 2, CANVAS_H / 2 + 18);
  }
}

// ── Utils ─────────────────────────────────────────────────────────────────────
function lerp(a, b, t)  { return a + (b - a) * t; }
function easeOut(t)     { return 1 - (1 - t) ** 2; }
function overlap(a, b)  {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}
