// Draws the pose-action HUD onto a canvas context.
// Call drawActionHUD(ctx, action, confidence) each frame after the game renders.

const ACTIONS = {
  jump:       { label: "↑",  color: "#74b9ff", col: 1, row: 0 },
  duck:       { label: "↓",  color: "#ffeaa7", col: 1, row: 2 },
  lean_left:  { label: "←",  color: "#55efc4", col: 0, row: 1 },
  lean_right: { label: "→",  color: "#55efc4", col: 2, row: 1 },
  squat:      { label: "SQ", color: "#fd79a8", col: 1, row: 1 },
  idle:       { label: "·",  color: "#636e72", col: 1, row: 1 },
};

const PAD  = 14;   // px from canvas edge
const CELL = 34;   // cell size
const GAP  = 4;    // gap between cells
const CORNER_X = 14; // offset from right edge: computed at draw time
const CORNER_Y = 310; // y start (near bottom)

export function drawActionHUD(ctx, action, confidence, canvasW) {
  const info = ACTIONS[action] ?? ACTIONS.idle;
  const ox = canvasW - PAD - (3 * CELL + 2 * GAP); // right-aligned origin x
  const oy = CORNER_Y;

  // Background panel
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  roundRect(ctx, ox - 8, oy - 8, 3 * CELL + 2 * GAP + 16, 3 * CELL + 2 * GAP + 16 + 22, 8);
  ctx.fill();

  // D-pad cells
  const cells = [
    { label: "↑",  col: 1, row: 0, match: ["jump"] },
    { label: "←",  col: 0, row: 1, match: ["lean_left"] },
    { label: "·",  col: 1, row: 1, match: ["idle", "squat", "calibrating"] },
    { label: "→",  col: 2, row: 1, match: ["lean_right"] },
    { label: "↓",  col: 1, row: 2, match: ["duck"] },
  ];

  for (const cell of cells) {
    const cx = ox + cell.col * (CELL + GAP);
    const cy = oy + cell.row * (CELL + GAP);
    const active = cell.match.includes(action);

    ctx.fillStyle = active ? (ACTIONS[action]?.color ?? "#fff") : "rgba(255,255,255,0.07)";
    roundRect(ctx, cx, cy, CELL, CELL, 6);
    ctx.fill();

    ctx.fillStyle = active ? "#111" : "rgba(255,255,255,0.3)";
    ctx.font = `bold ${cell.label === "·" ? 20 : 18}px monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(cell.label, cx + CELL / 2, cy + CELL / 2);
  }

  // Confidence bar below the D-pad
  const barX = ox - 8;
  const barY = oy + 3 * (CELL + GAP) + 2;
  const barW = 3 * CELL + 2 * GAP + 16;
  const barH = 8;

  ctx.fillStyle = "rgba(255,255,255,0.1)";
  roundRect(ctx, barX, barY, barW, barH, 4); ctx.fill();

  ctx.fillStyle = info.color;
  roundRect(ctx, barX, barY, barW * confidence, barH, 4); ctx.fill();

  // Action label
  ctx.fillStyle = info.color;
  ctx.font = "bold 11px monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillText(action.toUpperCase(), ox + (3 * CELL + 2 * GAP) / 2, barY + barH + 14);
}

// ── Hand-raise waiting screen ─────────────────────────────────────────────────

export function drawWaitingOverlay(ctx, holdProgress, canvasW, canvasH, {
  title    = "Raise your hand to play!",
  subtitle = "hold it up until the bar fills",
  color    = "#55efc4",
} = {}) {
  ctx.fillStyle = "rgba(0,0,0,0.72)";
  ctx.fillRect(0, 0, canvasW, canvasH);

  ctx.font = "52px serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("✋", canvasW / 2, canvasH / 2 - 52);

  ctx.fillStyle = "#fff";
  ctx.font = "bold 24px monospace";
  ctx.textBaseline = "alphabetic";
  ctx.fillText(title, canvasW / 2, canvasH / 2 + 10);

  ctx.fillStyle = "#a0aec0";
  ctx.font = "13px monospace";
  ctx.fillText(subtitle, canvasW / 2, canvasH / 2 + 34);

  // Progress bar
  const bw = 280;
  const bx = (canvasW - bw) / 2;
  const by = canvasH / 2 + 54;
  ctx.fillStyle = "rgba(255,255,255,0.1)";
  roundRect(ctx, bx, by, bw, 10, 5); ctx.fill();
  if (holdProgress > 0) {
    ctx.fillStyle = color;
    roundRect(ctx, bx, by, bw * holdProgress, 10, 5); ctx.fill();
  }
}

// ── Countdown overlay ─────────────────────────────────────────────────────────

export function drawCountdownOverlay(ctx, secondsLeft, canvasW, canvasH) {
  ctx.fillStyle = "rgba(0,0,0,0.6)";
  ctx.fillRect(0, 0, canvasW, canvasH);

  const label = secondsLeft > 0 ? String(secondsLeft) : "GO!";
  const color = secondsLeft > 0 ? "#ffeaa7" : "#55efc4";

  ctx.fillStyle = color;
  ctx.font = `bold ${secondsLeft > 0 ? 96 : 80}px monospace`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, canvasW / 2, canvasH / 2);
}

// ── Calibration progress overlay (shown before game starts) ──────────────────

export function drawCalibrationOverlay(ctx, progress, canvasW, canvasH) {
  const barW = canvasW * 0.4;
  const barH = 12;
  const bx = (canvasW - barW) / 2;
  const by = canvasH - 60;

  ctx.fillStyle = "rgba(0,0,0,0.55)";
  roundRect(ctx, bx - 12, by - 30, barW + 24, barH + 52, 8);
  ctx.fill();

  ctx.fillStyle = "rgba(255,255,255,0.12)";
  roundRect(ctx, bx, by, barW, barH, 6); ctx.fill();

  ctx.fillStyle = "#74b9ff";
  roundRect(ctx, bx, by, barW * progress, barH, 6); ctx.fill();

  ctx.fillStyle = "#a0aec0"; ctx.font = "13px monospace";
  ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
  ctx.fillText(
    `Calibrating… ${Math.round(progress * 100)}%  (stand still)`,
    canvasW / 2, by - 10
  );
}

// ── Tiny roundRect helper (fallback for older browsers) ──────────────────────
function roundRect(ctx, x, y, w, h, r) {
  if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); }
  else {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }
}
