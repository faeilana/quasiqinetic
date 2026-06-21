import * as Sentry from "@sentry/browser";
import { createPoseTracker, startWebcam } from "./poseTracker.js";
import { createClassifier } from "./classifyPose.js";
import { createRunner, CANVAS_W, CANVAS_H } from "./games/runner.js";
import { drawActionHUD, drawCalibrationOverlay, drawWaitingOverlay, drawCountdownOverlay } from "./hud.js";
import { startSession, endSession, logPrediction } from "./arizeClient.js";

if (import.meta.env.VITE_SENTRY_DSN) {
  Sentry.init({
    dsn: import.meta.env.VITE_SENTRY_DSN,
    environment: import.meta.env.MODE,
    tracesSampleRate: 0.1,
  });
}

const videoEl    = document.getElementById("webcam");
const overlayEl  = document.getElementById("overlay");
const gameCanvas = document.getElementById("game-canvas");
const statusEl   = document.getElementById("status");
const gameCtx    = gameCanvas.getContext("2d");

gameCanvas.width  = CANVAS_W;
gameCanvas.height = CANVAS_H;

function setStatus(msg, cls = "") {
  statusEl.textContent = msg;
  statusEl.className = cls;
}

const classifier = createClassifier();
const runner     = createRunner();

// ── App state machine ─────────────────────────────────────────────────────────
// pre-calibrate → calibrating → waiting → countdown → playing
let appPhase   = "pre-calibrate";
let prevRunnerPhase = "idle";

const HAND_RAISE_HOLD = 25; // frames (~0.8 s at 30 fps)
let handRaiseCount    = 0;

const COUNTDOWN_MS = 3000;
let countdownStart = null;

runner.render(gameCtx);

// ── Helpers ───────────────────────────────────────────────────────────────────

function isHandRaised(lm) {
  // True when either wrist is clearly above its same-side shoulder.
  const up = (wristIdx, shoulderIdx) => {
    const w = lm[wristIdx], s = lm[shoulderIdx];
    return w?.visibility > 0.5 && s?.visibility > 0.5 && (s.y - w.y) > 0.12;
  };
  return up(15, 11) || up(16, 12); // wrist indices 15/16, shoulder indices 11/12
}

function tickHandRaise(lm) {
  if (isHandRaised(lm)) {
    handRaiseCount++;
  } else {
    handRaiseCount = Math.max(0, handRaiseCount - 1); // slow decay
  }
  return handRaiseCount;
}

// ── Main pose callback ────────────────────────────────────────────────────────
function onPoseResult(landmarks, worldLandmarks) {

  // ── pre-calibrate: wait for hand raise before starting calibration ──────
  if (appPhase === "pre-calibrate") {
    tickHandRaise(landmarks);
    runner.render(gameCtx);
    drawWaitingOverlay(gameCtx, handRaiseCount / HAND_RAISE_HOLD, CANVAS_W, CANVAS_H, {
      title:    "Raise your hand to calibrate",
      subtitle: "step back so your full body is visible",
      color:    "#74b9ff",
    });
    setStatus("Raise your hand to begin calibration");

    if (handRaiseCount >= HAND_RAISE_HOLD) {
      appPhase       = "calibrating";
      handRaiseCount = 0;
    }
    return;
  }

  // ── calibrating: feed landmarks to classifier until baseline is set ─────
  if (appPhase === "calibrating") {
    const { calibrating, calibrationProgress } = classifier.classify(landmarks, worldLandmarks);
    runner.render(gameCtx);
    drawCalibrationOverlay(gameCtx, calibrationProgress ?? 0, CANVAS_W, CANVAS_H);
    setStatus("Stand still — calibrating…");

    if (!calibrating) appPhase = "waiting"; // calibration complete
    return;
  }

  // ── waiting: raise hand to start the game ───────────────────────────────
  if (appPhase === "waiting") {
    tickHandRaise(landmarks);
    runner.render(gameCtx);
    drawWaitingOverlay(gameCtx, handRaiseCount / HAND_RAISE_HOLD, CANVAS_W, CANVAS_H);
    setStatus("Raise your hand to play!");

    if (handRaiseCount >= HAND_RAISE_HOLD) {
      appPhase       = "countdown";
      countdownStart = performance.now();
      handRaiseCount = 0;
    }
    return;
  }

  // ── countdown: 3 … 2 … 1 … GO! ─────────────────────────────────────────
  if (appPhase === "countdown") {
    const elapsed     = performance.now() - countdownStart;
    const secondsLeft = Math.ceil((COUNTDOWN_MS - elapsed) / 1000);
    runner.render(gameCtx);
    drawCountdownOverlay(gameCtx, secondsLeft, CANVAS_W, CANVAS_H);

    if (elapsed >= COUNTDOWN_MS) {
      runner.start();
      startSession("runner");
      prevRunnerPhase = "playing";
      appPhase        = "playing";
      setStatus("Go!", "ready");
    }
    return;
  }

  // ── playing ──────────────────────────────────────────────────────────────
  const { action, confidence } = classifier.classify(landmarks, worldLandmarks);
  const runnerPhase = runner.getPhase();

  if (runnerPhase === "dead" && prevRunnerPhase !== "dead") {
    endSession(runner.getScore());
    setStatus("Game over — raise your hand to play again");
  }

  runner.update(action);
  runner.render(gameCtx);

  if (runnerPhase !== "dead") {
    drawActionHUD(gameCtx, action, confidence, CANVAS_W);
    setStatus("Go!", "ready");
  }

  // If runner restarted inside update(), go back to "waiting" for next hand raise.
  const runnerPhaseAfter = runner.getPhase();
  if (runnerPhase === "dead" && runnerPhaseAfter === "playing") {
    appPhase       = "waiting";
    handRaiseCount = 0;
  }
  prevRunnerPhase = runnerPhaseAfter;

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
  } catch (err) {
    Sentry.captureException(err);
    setStatus(`Error: ${err.message}`, "error");
    console.error(err);
  }
}

main();
