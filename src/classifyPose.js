import { LM } from "./poseTracker.js";

// ── Tunable thresholds ──────────────────────────────────────────────────────
// All values in normalised landmark coords (0–1) unless noted.
// Bump these after reviewing Arize accuracy per action.

const CALIBRATION_FRAMES = 60; // ~2 s at 30 fps

const JUMP_HIP_DROP    = 0.07; // hips must rise this much above baseline (y decreases = up)
const JUMP_CONF_RANGE  = 0.10; // delta range over which confidence goes 0→1 past threshold

const DUCK_SHOULDER_FALL  = 0.07; // shoulders must drop this much below baseline (y increases = down)
const DUCK_CONF_RANGE     = 0.10;

const LEAN_THRESHOLD  = 0.07; // hip-centre x must shift this much from baseline
const LEAN_CONF_RANGE = 0.10;
// NOTE on x-axis convention: raw landmark x=0 is left edge of the *unmirrored* frame,
// so the user's right side has a lower x.  When user leans RIGHT (as seen on their
// mirrored display), raw hipX DECREASES.  That's why lean_right uses (baseline.hipX - hipX).

const SQUAT_KNEE_ANGLE = 100; // degrees; below this = squat (use world landmarks for 3-D accuracy)
const SQUAT_CONF_RANGE  = 30; // degrees range for 0→1 confidence

const MIN_VISIBILITY = 0.5;   // ignore landmarks whose MediaPipe visibility is below this

// ── Helpers ─────────────────────────────────────────────────────────────────

function avg(arr) { return arr.reduce((s, v) => s + v, 0) / arr.length; }

function clamp01(v) { return Math.max(0, Math.min(1, v)); }

// Angle at joint b formed by a–b–c, using 3-D world-landmark coords (metres).
function angleDeg(a, b, c) {
  const ba = { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
  const bc = { x: c.x - b.x, y: c.y - b.y, z: c.z - b.z };
  const dot = ba.x * bc.x + ba.y * bc.y + ba.z * bc.z;
  const mag = Math.hypot(ba.x, ba.y, ba.z) * Math.hypot(bc.x, bc.y, bc.z);
  if (mag < 1e-9) return 180;
  return Math.acos(Math.max(-1, Math.min(1, dot / mag))) * (180 / Math.PI);
}

function allVisible(lm, ...indices) {
  return indices.every(i => lm[i]?.visibility >= MIN_VISIBILITY);
}

// ── Factory ──────────────────────────────────────────────────────────────────

/**
 * Returns a stateful classifier tied to one calibration session.
 * Call reset() between sessions or when the user re-enters frame.
 *
 * @returns {{
 *   classify: (landmarks, worldLandmarks) => {action: string, confidence: number, calibrating: boolean, calibrationProgress?: number},
 *   reset: () => void,
 *   isCalibrating: () => boolean,
 * }}
 */
export function createClassifier() {
  let samples = [];
  let baseline = null;

  function isCalibrating() { return baseline === null; }

  function reset() {
    samples = [];
    baseline = null;
  }

  function classify(landmarks, worldLandmarks) {
    if (!landmarks || landmarks.length < 33) {
      return { action: "idle", confidence: 0, calibrating: isCalibrating() };
    }

    const lHip      = landmarks[LM.LEFT_HIP];
    const rHip      = landmarks[LM.RIGHT_HIP];
    const lShoulder = landmarks[LM.LEFT_SHOULDER];
    const rShoulder = landmarks[LM.RIGHT_SHOULDER];

    const hipY      = (lHip.y + rHip.y) / 2;
    const shoulderY = (lShoulder.y + rShoulder.y) / 2;
    const hipX      = (lHip.x + rHip.x) / 2;

    // ── Calibration phase ──
    if (!baseline) {
      if (allVisible(landmarks, LM.LEFT_HIP, LM.RIGHT_HIP, LM.LEFT_SHOULDER, LM.RIGHT_SHOULDER)) {
        samples.push({ hipY, shoulderY, hipX });
      }
      if (samples.length >= CALIBRATION_FRAMES) {
        baseline = {
          hipY:      avg(samples.map(s => s.hipY)),
          shoulderY: avg(samples.map(s => s.shoulderY)),
          hipX:      avg(samples.map(s => s.hipX)),
        };
      }
      return {
        action: "calibrating",
        confidence: 0,
        calibrating: true,
        calibrationProgress: Math.min(1, samples.length / CALIBRATION_FRAMES),
      };
    }

    // ── Action detection (priority order) ──

    // 1. Jump — hips rise above baseline (y decreases toward 0 = top of frame)
    if (allVisible(landmarks, LM.LEFT_HIP, LM.RIGHT_HIP)) {
      const delta = baseline.hipY - hipY;
      if (delta > JUMP_HIP_DROP) {
        return { action: "jump", confidence: clamp01(delta / (JUMP_HIP_DROP + JUMP_CONF_RANGE)), calibrating: false };
      }
    }

    // 2. Duck — shoulders fall below baseline (y increases toward 1 = bottom of frame)
    if (allVisible(landmarks, LM.LEFT_SHOULDER, LM.RIGHT_SHOULDER)) {
      const delta = shoulderY - baseline.shoulderY;
      if (delta > DUCK_SHOULDER_FALL) {
        return { action: "duck", confidence: clamp01(delta / (DUCK_SHOULDER_FALL + DUCK_CONF_RANGE)), calibrating: false };
      }
    }

    // 3. Lean right / left — whole body shifts laterally
    if (allVisible(landmarks, LM.LEFT_HIP, LM.RIGHT_HIP)) {
      const delta = baseline.hipX - hipX; // positive = moved right on mirrored display
      if (delta > LEAN_THRESHOLD) {
        return { action: "lean_right", confidence: clamp01(delta / (LEAN_THRESHOLD + LEAN_CONF_RANGE)), calibrating: false };
      }
      if (-delta > LEAN_THRESHOLD) {
        return { action: "lean_left", confidence: clamp01(-delta / (LEAN_THRESHOLD + LEAN_CONF_RANGE)), calibrating: false };
      }
    }

    // 4. Squat — knee angle drops below threshold (3-D world landmarks for accuracy)
    if (
      worldLandmarks &&
      allVisible(landmarks, LM.LEFT_HIP, LM.LEFT_KNEE, LM.LEFT_ANKLE, LM.RIGHT_HIP, LM.RIGHT_KNEE, LM.RIGHT_ANKLE)
    ) {
      const leftAngle  = angleDeg(worldLandmarks[LM.LEFT_HIP],  worldLandmarks[LM.LEFT_KNEE],  worldLandmarks[LM.LEFT_ANKLE]);
      const rightAngle = angleDeg(worldLandmarks[LM.RIGHT_HIP], worldLandmarks[LM.RIGHT_KNEE], worldLandmarks[LM.RIGHT_ANKLE]);
      const kneeAngle  = Math.min(leftAngle, rightAngle);
      if (kneeAngle < SQUAT_KNEE_ANGLE) {
        return { action: "squat", confidence: clamp01((SQUAT_KNEE_ANGLE - kneeAngle) / SQUAT_CONF_RANGE), calibrating: false };
      }
    }

    // 5. Idle — nothing triggered
    return { action: "idle", confidence: 1, calibrating: false };
  }

  return { classify, reset, isCalibrating };
}
