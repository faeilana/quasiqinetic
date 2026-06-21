import { LM } from "./poseTracker.js";

// ── Tunable thresholds ──────────────────────────────────────────────────────
// All values in normalised landmark coords (0–1) unless noted.
// Bump these after reviewing Arize accuracy per action.

const CALIBRATION_FRAMES = 60; // ~2 s at 30 fps

const JUMP_HIP_DROP    = 0.10; // hips must rise this much above smoothed baseline (y decreases = up)
const JUMP_CONF_RANGE  = 0.08;
const JUMP_CONSEC_REQ  = 3;    // consecutive frames of elevation needed — filters out sway/noise
const JUMP_COOLDOWN_F  = 20;   // frames before jump can re-trigger after firing
const HIP_SMOOTH_N     = 4;    // rolling-average window to smooth noisy hip readings
const JUMP_VELOCITY_THRESHOLD = -0.8; // normalized units/sec; negative = moving up
const SHOULDER_WEIGHT  = 0.3;  // how much shoulder rise contributes to jump detection

const DUCK_SHOULDER_FALL  = 0.09; // shoulders must drop this much below baseline (y increases = down)
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
  let samples      = [];
  let baseline     = null;
  let jumpConsec   = 0;   // consecutive frames hip is above threshold
  let jumpCooldown = 0;   // frames remaining before jump can fire again
  let hipYHistory  = [];  // rolling buffer for hip-Y smoothing
  let shoulderYHistory = []; // rolling buffer for shoulder-Y smoothing
  let prevHipY     = null; // for velocity computation
  let prevTimestamp = null;
  // Schmitt-trigger zone: -1=left, 0=center, 1=right.
  // Enters a zone when delta crosses LEAN_THRESHOLD; exits when delta returns
  // within 40% of threshold, preventing jitter near the boundary.
  let leanZone = 0;

  function isCalibrating() { return baseline === null; }

  function reset() {
    samples      = [];
    baseline     = null;
    jumpConsec   = 0;
    jumpCooldown = 0;
    hipYHistory  = [];
    leanZone     = 0;
  }

  // Clear transient action state without discarding calibration baseline.
  // Call this when a new game starts.
  function clearJumpState() {
    jumpConsec   = 0;
    jumpCooldown = 0;
    hipYHistory  = [];
    shoulderYHistory = [];
    prevHipY     = null;
    prevTimestamp = null;
    leanZone     = 0;
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

    // Smooth hip-Y over a rolling window to suppress frame-to-frame noise.
    hipYHistory.push(hipY);
    if (hipYHistory.length > HIP_SMOOTH_N) hipYHistory.shift();
    const smoothHipY = avg(hipYHistory);

    // Smooth shoulder-Y for combined jump detection
    shoulderYHistory.push(shoulderY);
    if (shoulderYHistory.length > HIP_SMOOTH_N) shoulderYHistory.shift();
    const smoothShoulderY = avg(shoulderYHistory);

    // Compute hip velocity (negative = moving up)
    const now = performance.now();
    let hipVelocity = 0;
    if (prevHipY !== null && prevTimestamp !== null) {
      const dt = (now - prevTimestamp) / 1000;
      if (dt > 0) hipVelocity = (hipY - prevHipY) / dt;
    }
    prevHipY = hipY;
    prevTimestamp = now;

    // 1. Jump — uses combined position delta AND velocity for early detection.
    //    Position: smoothed hips (+ shoulder contribution) above baseline.
    //    Velocity: rapid upward movement triggers immediately.
    if (jumpCooldown > 0) {
      jumpCooldown--;
      jumpConsec = 0;
    } else if (allVisible(landmarks, LM.LEFT_HIP, LM.RIGHT_HIP)) {
      const hipDelta = baseline.hipY - smoothHipY;  // positive = hips moved up
      const shoulderDelta = baseline.shoulderY - smoothShoulderY; // positive = shoulders up
      const combinedDelta = hipDelta + SHOULDER_WEIGHT * shoulderDelta;

      // Velocity-based early trigger: fast upward movement fires jump immediately
      const velocityTriggered = hipVelocity < JUMP_VELOCITY_THRESHOLD && hipDelta > JUMP_HIP_DROP * 0.5;

      if (combinedDelta > JUMP_HIP_DROP || velocityTriggered) {
        jumpConsec++;
        if (jumpConsec >= JUMP_CONSEC_REQ || velocityTriggered) {
          jumpCooldown = JUMP_COOLDOWN_F;
          jumpConsec   = 0;
          const conf = velocityTriggered
            ? clamp01(Math.abs(hipVelocity) / (Math.abs(JUMP_VELOCITY_THRESHOLD) * 2))
            : clamp01(combinedDelta / (JUMP_HIP_DROP + JUMP_CONF_RANGE));
          return { action: "jump", confidence: conf, calibrating: false };
        }
      } else {
        jumpConsec = 0;  // reset streak if elevation drops below threshold
      }
    }

    // 2. Duck — shoulders fall below baseline (y increases toward 1 = bottom of frame)
    if (allVisible(landmarks, LM.LEFT_SHOULDER, LM.RIGHT_SHOULDER)) {
      const delta = shoulderY - baseline.shoulderY;
      if (delta > DUCK_SHOULDER_FALL) {
        return { action: "duck", confidence: clamp01(delta / (DUCK_SHOULDER_FALL + DUCK_CONF_RANGE)), calibrating: false };
      }
    }

    // 3. Lean right / left — continuous zone mapping (Schmitt trigger).
    //    Body position directly maps to a lane zone; the character tracks
    //    wherever the body is. Returning to center moves the character to middle.
    if (allVisible(landmarks, LM.LEFT_HIP, LM.RIGHT_HIP)) {
      const delta = baseline.hipX - hipX; // positive = moved right on mirrored display

      // Update Schmitt zone with asymmetric thresholds to suppress boundary jitter.
      if (leanZone === 0) {
        if (delta  >  LEAN_THRESHOLD) leanZone =  1;
        if (-delta >  LEAN_THRESHOLD) leanZone = -1;
      } else if (leanZone === 1) {
        if (delta  < LEAN_THRESHOLD * 0.4) leanZone = 0;
      } else {
        if (-delta < LEAN_THRESHOLD * 0.4) leanZone = 0;
      }

      if (leanZone ===  1) return { action: "lean_right", confidence: clamp01(delta  / (LEAN_THRESHOLD + LEAN_CONF_RANGE)), calibrating: false };
      if (leanZone === -1) return { action: "lean_left",  confidence: clamp01(-delta / (LEAN_THRESHOLD + LEAN_CONF_RANGE)), calibrating: false };
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
    const centeredNow = !allVisible(landmarks, LM.LEFT_HIP, LM.RIGHT_HIP)
      || Math.abs(baseline.hipX - hipX) < LEAN_THRESHOLD * 1.5;
    return { action: "idle", confidence: 1, calibrating: false, centered: centeredNow };
  }

  return { classify, reset, clearJumpState, isCalibrating };
}
