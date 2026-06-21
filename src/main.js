import * as Sentry from "@sentry/browser";
import { createPoseTracker, startWebcam } from "./poseTracker.js";
import { createClassifier } from "./classifyPose.js";
import { PoseHistory } from "./poseHistory.js";
import { createRunner, CANVAS_W, CANVAS_H } from "./games/runner.js";
import { drawActionHUD, drawCalibrationOverlay, drawWaitingOverlay, drawCountdownOverlay } from "./hud.js";
import { startSession, endSession, logPrediction } from "./arizeClient.js";
import { createStats } from "./stats.js";

if (import.meta.env.VITE_SENTRY_DSN) {
  Sentry.init({
    dsn: import.meta.env.VITE_SENTRY_DSN,
    environment: import.meta.env.MODE,
    tracesSampleRate: 0.1,
  });
}

const videoEl    = document.getElementById("webcam");
const overlayEl  = document.getElementById("overlay");
const gameCanvas = document.getElementById("game-canvas");   // Three.js WebGL
const hudCanvas  = document.getElementById("hud-canvas");    // 2D overlay
const statusEl   = document.getElementById("status");

// 2D context for all HUD/overlay drawing (sits on top of WebGL canvas)
const hudCtx = hudCanvas.getContext("2d");
hudCanvas.width  = CANVAS_W;
hudCanvas.height = CANVAS_H;

function setStatus(msg, cls = "") {
  statusEl.textContent = msg;
  statusEl.className = cls;
}

const classifier  = createClassifier();
const poseHistory = new PoseHistory();
const runner      = createRunner(gameCanvas);   // Three.js takes the canvas
const stats       = createStats();

// ── Shared pose state (written by pose callback, read by game loop) ──────────
let latestLandmarks      = null;
let latestWorldLandmarks = null;
let poseReady            = false;

// ── App state machine ─────────────────────────────────────────────────────────
// pre-calibrate → calibrating → waiting → countdown → playing
let appPhase        = "pre-calibrate";
let prevRunnerPhase = "idle";

const HAND_RAISE_HOLD = 25;
let handRaiseCount    = 0;

const COUNTDOWN_MS = 3000;
let countdownStart = null;

// Initial render — shows the 3D scene with idle overlay
runner.render();
runner.drawHUD(hudCtx);

// ── Helpers ───────────────────────────────────────────────────────────────────
function isHandRaised(lm) {
  const up = (wristIdx, shoulderIdx) => {
    const w = lm[wristIdx], s = lm[shoulderIdx];
    return w?.visibility > 0.5 && s?.visibility > 0.5 && (s.y - w.y) > 0.12;
  };
  return up(15, 11) || up(16, 12);
}

// Returns true if the player's hips are roughly centered in the camera frame.
function isPersonCentered(lm) {
  const l = lm[23], r = lm[24];
  if (!l || !r || (l.visibility ?? 0) < 0.5 || (r.visibility ?? 0) < 0.5) return true;
  const hipX = (l.x + r.x) / 2;
  return Math.abs(hipX - 0.5) < 0.18;
}

function maybDrawCenterWarning(lm) {
  if (isPersonCentered(lm)) return;
  hudCtx.save();
  hudCtx.fillStyle = 'rgba(251,191,36,0.92)';
  hudCtx.font      = 'bold 13px monospace';
  hudCtx.textAlign = 'center';
  hudCtx.textBaseline = 'top';
  hudCtx.shadowColor  = '#fbbf24';
  hudCtx.shadowBlur   = 10;
  hudCtx.fillText('⚠ Move to the CENTER of the frame', CANVAS_W / 2, 14);
  hudCtx.restore();
}

function tickHandRaise(lm) {
  if (isHandRaised(lm)) { handRaiseCount++; }
  else                  { handRaiseCount = Math.max(0, handRaiseCount - 1); }
  return handRaiseCount;
}

function renderWithOverlay(drawFn) {
  runner.render();
  hudCtx.clearRect(0, 0, CANVAS_W, CANVAS_H);
  drawFn();
}

// ── Pose callback (only stores data, no rendering) ────────────────────────────
function onPoseResult(landmarks, worldLandmarks) {
  latestLandmarks = landmarks;
  latestWorldLandmarks = worldLandmarks;
  poseHistory.push(landmarks);
  poseReady = true;
}

// ── Game loop (runs at display refresh rate, decoupled from pose detection) ───
function gameLoop() {
  requestAnimationFrame(gameLoop);

  if (!poseReady || !latestLandmarks) return;

  // Use smoothed landmarks for display/classification
  const landmarks = poseHistory.getSmoothed() || latestLandmarks;
  const worldLandmarks = latestWorldLandmarks;

  // ── pre-calibrate ──────────────────────────────────────────────────────────
  if (appPhase === "pre-calibrate") {
    tickHandRaise(landmarks);
    renderWithOverlay(() => {
      drawWaitingOverlay(hudCtx, handRaiseCount / HAND_RAISE_HOLD, CANVAS_W, CANVAS_H, {
        title:    "Raise your hand to calibrate",
        subtitle: "step back so your full body is visible",
        color:    "#74b9ff",
      });
      maybDrawCenterWarning(landmarks);
    });
    setStatus("Raise your hand to begin calibration");
    if (handRaiseCount >= HAND_RAISE_HOLD) { appPhase = "calibrating"; handRaiseCount = 0; }
    return;
  }

  // ── calibrating ────────────────────────────────────────────────────────────
  if (appPhase === "calibrating") {
    const { calibrating, calibrationProgress } = classifier.classify(landmarks, worldLandmarks);
    renderWithOverlay(() => {
      drawCalibrationOverlay(hudCtx, calibrationProgress ?? 0, CANVAS_W, CANVAS_H);
      maybDrawCenterWarning(landmarks);
    });
    setStatus("Stand still — calibrating…");
    if (!calibrating) appPhase = "waiting";
    return;
  }

  // ── waiting ────────────────────────────────────────────────────────────────
  if (appPhase === "waiting") {
    tickHandRaise(landmarks);
    renderWithOverlay(() => {
      drawWaitingOverlay(hudCtx, handRaiseCount / HAND_RAISE_HOLD, CANVAS_W, CANVAS_H);
      maybDrawCenterWarning(landmarks);
    });
    setStatus("Raise your hand to play!");
    if (handRaiseCount >= HAND_RAISE_HOLD) {
      appPhase = "countdown"; countdownStart = performance.now(); handRaiseCount = 0;
    }
    return;
  }

  // ── countdown ──────────────────────────────────────────────────────────────
  if (appPhase === "countdown") {
    const elapsed     = performance.now() - countdownStart;
    const secondsLeft = Math.ceil((COUNTDOWN_MS - elapsed) / 1000);
    renderWithOverlay(() => drawCountdownOverlay(hudCtx, secondsLeft, CANVAS_W, CANVAS_H));
    if (elapsed >= COUNTDOWN_MS) {
      classifier.clearJumpState();
      poseHistory.clear();
      stats.begin();
      runner.start();
      startSession("runner");
      prevRunnerPhase = "playing";
      appPhase        = "playing";
      setStatus("Go!", "ready");
    }
    return;
  }

  // ── playing ────────────────────────────────────────────────────────────────
  const { action, confidence } = classifier.classify(landmarks, worldLandmarks);
  const runnerPhase = runner.getPhase();

  if (runnerPhase === "dead" && prevRunnerPhase !== "dead") {
    stats.finish(runner.getScore());
    endSession(runner.getScore());
    setStatus("Game over — raise your hand to play again");
  }
  if (runnerPhase === "won" && prevRunnerPhase !== "won") {
    stats.finish(runner.getScore());
  }

  stats.record(action);
  runner.update(action);

  // 3D render + 2D HUD
  runner.render();
  hudCtx.clearRect(0, 0, CANVAS_W, CANVAS_H);
  runner.drawHUD(hudCtx);
  if (runnerPhase === "playing") {
    drawActionHUD(hudCtx, action, confidence, CANVAS_W);
    setStatus("Go!", "ready");
  }

  // If runner reached dead/won → go back to waiting for next hand raise
  const afterPhase = runner.getPhase();
  if ((runnerPhase === "dead" || runnerPhase === "won") && afterPhase !== runnerPhase) {
    appPhase = "waiting"; handRaiseCount = 0;
  }
  prevRunnerPhase = afterPhase;

  logPrediction(action, confidence, {
    hipY:      (landmarks[23].y + landmarks[24].y) / 2,
    shoulderY: (landmarks[11].y + landmarks[12].y) / 2,
    hipX:      (landmarks[23].x + landmarks[24].x) / 2,
  });
}

// ── Boot ──────────────────────────────────────────────────────────────────────
async function main() {
  try {
    setStatus("Requesting webcam…");
    await startWebcam(videoEl);
    setStatus("Loading MediaPipe… (first load ~20s)");
    await createPoseTracker(videoEl, overlayEl, onPoseResult, (msg) => setStatus(msg));
    setStatus("Step back so your full body is visible — raise hand to start");

    // Start decoupled game loop
    requestAnimationFrame(gameLoop);
  } catch (err) {
    Sentry.captureException(err);
    setStatus(`Error: ${err.message}`, "error");
    console.error(err);
  }
}

main();
