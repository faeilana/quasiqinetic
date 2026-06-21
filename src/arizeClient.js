// Queues pose prediction events and flushes them to the FastAPI backend,
// which logs each one to Arize. Falls back to in-memory buffering if
// the backend isn't up yet — events are sent once it comes online.

const BACKEND = import.meta.env.VITE_BACKEND_URL ?? "http://localhost:8000";
const FLUSH_INTERVAL_MS = 4000;
const MAX_QUEUE = 1000; // drop oldest when exceeded

let sessionId = null;
const queue   = [];
let flushTimer = null;

// ── Session lifecycle ─────────────────────────────────────────────────────────

export async function startSession(gameId = "runner") {
  try {
    const res = await fetch(`${BACKEND}/session/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ game_id: gameId }),
    });
    const data = await res.json();
    sessionId = data.session_id;
    console.log("[arize] session started:", sessionId);
  } catch {
    // Backend not up yet — generate a client-side ID so we can buffer events.
    sessionId = crypto.randomUUID();
    console.warn("[arize] backend unavailable, buffering locally under", sessionId);
  }
  flushTimer = setInterval(flush, FLUSH_INTERVAL_MS);
  return sessionId;
}

export async function endSession(score) {
  clearInterval(flushTimer);
  await flush();
  if (!sessionId) return;
  try {
    await fetch(`${BACKEND}/session/${sessionId}/end`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ score }),
    });
    console.log("[arize] session ended, score:", score);
  } catch {
    console.warn("[arize] could not end session on backend");
  }
}

// ── Per-frame prediction logging ──────────────────────────────────────────────

/**
 * Queue one classified pose frame.
 * @param {string} action
 * @param {number} confidence
 * @param {{ hipY: number, shoulderY: number, hipX: number }} features
 */
export function logPrediction(action, confidence, features) {
  if (queue.length >= MAX_QUEUE) queue.shift(); // drop oldest on overflow
  queue.push({
    session_id:  sessionId,
    timestamp:   Date.now(),
    action,
    confidence,
    hip_y:       features.hipY,
    shoulder_y:  features.shoulderY,
    hip_x:       features.hipX,
  });
}

// ── Flush loop ────────────────────────────────────────────────────────────────

async function flush() {
  if (!queue.length || !sessionId) return;
  const batch = queue.splice(0); // drain
  try {
    await fetch(`${BACKEND}/session/${sessionId}/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ events: batch }),
    });
  } catch {
    // Backend offline — put events back so they send when it comes up.
    queue.unshift(...batch);
    console.log(`[arize] backend unavailable — ${queue.length} events buffered`);
  }
}
