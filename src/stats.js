// Session stat tracker — records actions each frame, persists to localStorage.
// Dashboard reads localStorage directly (no backend needed for demo).

const STORAGE_KEY = 'movement-runner-sessions';
const WEIGHT_KG   = 65;   // assumed body weight for calorie estimate
const FPS         = 30;   // pose tracker throttles to ~30 fps

// Joint activation score per action (higher = more stress on that joint).
// These drive the heatmap colours on the dashboard.
export const JOINT_ACTIVATION = {
  jump:       { leftKnee: 3, rightKnee: 3, leftAnkle: 2, rightAnkle: 2, leftHip: 1, rightHip: 1, spine: 1 },
  duck:       { leftKnee: 3, rightKnee: 3, leftHip: 2, rightHip: 2, lowerBack: 3, spine: 1 },
  lean_left:  { spine: 2, leftHip: 2, rightHip: 1, leftShoulder: 1 },
  lean_right: { spine: 2, rightHip: 2, leftHip: 1, rightShoulder: 1 },
  idle:       {},
};

// Approximate METs (Metabolic Equivalent of Task).
// Calories/frame = MET × kg / 3600 / FPS
const MET = { jump: 8, duck: 5, lean_left: 3, lean_right: 3, idle: 2 };

export function createStats() {
  let session = makeSession();

  function makeSession() {
    return {
      startTime:    Date.now(),
      endTime:      null,
      score:        0,
      calories:     0,
      actionCounts: { jump: 0, duck: 0, lean_left: 0, lean_right: 0, idle: 0 },
      jointHeat:    {},
    };
  }

  function begin() { session = makeSession(); }

  function record(action) {
    const met = MET[action] ?? MET.idle;
    session.calories += met * WEIGHT_KG / 3600 / FPS;
    session.actionCounts[action] = (session.actionCounts[action] ?? 0) + 1;
    for (const [joint, score] of Object.entries(JOINT_ACTIVATION[action] ?? {})) {
      session.jointHeat[joint] = (session.jointHeat[joint] ?? 0) + score;
    }
  }

  function finish(score) {
    session.endTime = Date.now();
    session.score   = score;
    const all = loadAll();
    all.unshift({ ...session });
    if (all.length > 20) all.length = 20;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
    return session;
  }

  function loadAll() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]'); }
    catch { return []; }
  }

  function current() { return session; }

  return { begin, record, finish, loadAll, current };
}
