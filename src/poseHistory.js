const HISTORY_LENGTH = 12;
const SMOOTHING_WINDOW = 3;

/**
 * Tracks full landmark history for temporal smoothing and velocity computation.
 * Works with MediaPipe normalized landmarks (0-1 coords).
 */
export class PoseHistory {
  constructor() {
    this.frames = [];
    this.timestamps = [];
  }

  push(landmarks) {
    const now = performance.now();
    this.frames.push(landmarks);
    this.timestamps.push(now);

    if (this.frames.length > HISTORY_LENGTH) {
      this.frames.shift();
      this.timestamps.shift();
    }
  }

  get length() {
    return this.frames.length;
  }

  getSmoothed() {
    if (this.frames.length === 0) return null;
    if (this.frames.length === 1) return this.frames[0];

    const window = this.frames.slice(-SMOOTHING_WINDOW);
    const numLandmarks = window[0].length;
    const smoothed = [];

    for (let k = 0; k < numLandmarks; k++) {
      let xSum = 0;
      let ySum = 0;
      let zSum = 0;
      let visSum = 0;
      let validCount = 0;

      for (const frame of window) {
        if (frame[k] && (frame[k].visibility ?? 0) > 0.3) {
          xSum += frame[k].x;
          ySum += frame[k].y;
          zSum += frame[k].z || 0;
          visSum += frame[k].visibility ?? 0;
          validCount++;
        }
      }

      if (validCount > 0) {
        smoothed.push({
          x: xSum / validCount,
          y: ySum / validCount,
          z: zSum / validCount,
          visibility: visSum / validCount,
        });
      } else {
        smoothed.push(this.frames[this.frames.length - 1][k]);
      }
    }

    return smoothed;
  }

  /**
   * Returns velocity (units/sec) for a given landmark index.
   * Negative vy = moving up on screen.
   */
  getVelocity(landmarkIndex) {
    if (this.frames.length < 2) return { vx: 0, vy: 0 };

    const recent = this.frames.slice(-3);
    const times = this.timestamps.slice(-3);
    let vxSum = 0;
    let vySum = 0;
    let count = 0;

    for (let i = 1; i < recent.length; i++) {
      const curr = recent[i][landmarkIndex];
      const prev = recent[i - 1][landmarkIndex];
      const dt = (times[i] - times[i - 1]) / 1000;

      if (curr && prev && (curr.visibility ?? 0) > 0.4 && (prev.visibility ?? 0) > 0.4 && dt > 0) {
        vxSum += (curr.x - prev.x) / dt;
        vySum += (curr.y - prev.y) / dt;
        count++;
      }
    }

    if (count === 0) return { vx: 0, vy: 0 };
    return { vx: vxSum / count, vy: vySum / count };
  }

  clear() {
    this.frames = [];
    this.timestamps = [];
  }
}
