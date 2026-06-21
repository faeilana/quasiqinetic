import { PoseLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";

// Coloured connection groups — matches the segmented skeleton style.
const SEGMENTS = [
  { color: "#00e676", pairs: [[0,1],[1,2],[2,3],[3,7],[0,4],[4,5],[5,6],[6,8],[9,10]] }, // face (green)
  { color: "#448aff", pairs: [[11,13],[13,15],[12,14],[14,16]] },                         // arms (blue)
  { color: "#e040fb", pairs: [[11,12],[11,23],[12,24],[23,24]] },                         // torso (purple)
  { color: "#ff9100", pairs: [[23,25],[25,27],[24,26],[26,28],[27,29],[28,30],[29,31],[30,32]] }, // legs (orange)
];

// Dot colour by landmark index range
function dotColor(i) {
  if (i <= 10)  return "#00e676"; // face — green
  if (i <= 16)  return "#448aff"; // arms — blue
  if (i <= 22)  return "#448aff"; // hands — blue
  if (i <= 24)  return "#e040fb"; // hips — purple
  return "#ff9100";               // legs — orange
}

export const LM = {
  NOSE: 0,
  LEFT_SHOULDER: 11, RIGHT_SHOULDER: 12,
  LEFT_ELBOW: 13,    RIGHT_ELBOW: 14,
  LEFT_WRIST: 15,    RIGHT_WRIST: 16,
  LEFT_HIP: 23,      RIGHT_HIP: 24,
  LEFT_KNEE: 25,     RIGHT_KNEE: 26,
  LEFT_ANKLE: 27,    RIGHT_ANKLE: 28,
};

export async function createPoseTracker(videoEl, canvasEl, onPoseResult, onStatus) {
  const status = (msg) => {
    console.log("[mediapipe]", msg);
    onStatus?.(msg);
  };

  const withTimeout = (promise, ms, label) =>
    Promise.race([
      promise,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`MediaPipe timeout after ${ms / 1000}s (${label})`)), ms)
      ),
    ]);

  status("Loading WASM runtime…");
  const vision = await withTimeout(
    FilesetResolver.forVisionTasks("/mediapipe"),
    20000,
    "WASM load"
  );
  status("WASM loaded ✓ — loading pose model…");

  // Provide Module.canvas so Emscripten can create its internal WebGL context.
  // We need WebGL even with delegate:"CPU" because MediaPipe still uploads
  // frames to a GL texture for pre-processing inside ra() in vision_bundle.mjs.
  //
  // Problem: GL.createContext() in the Emscripten loader installs a
  // "fixedGetContext" Safari workaround on the canvas object.  On Safari,
  // WebGL2RenderingContext extends WebGLRenderingContext, so the instanceof
  // check in fixedGetContext returns null for "webgl2" requests — breaking ra().
  //
  // Solution: wrap the canvas in a Proxy whose get("getContext") trap always
  // returns a function that hands back the real cached WebGL context, making
  // all fixedGetContext patching a no-op.
  const _realGLCanvas = document.createElement("canvas");
  _realGLCanvas.width = 640;
  _realGLCanvas.height = 480;
  // Attach hidden so WebGL is granted in all browsers (some restrict off-DOM).
  _realGLCanvas.style.cssText = "position:absolute;opacity:0;pointer-events:none;top:-1px;left:-1px;width:1px;height:1px";
  document.body.appendChild(_realGLCanvas);

  const _glCtx = _realGLCanvas.getContext("webgl2") || _realGLCanvas.getContext("webgl");
  console.log("[mediapipe] WebGL available:", !!_glCtx, _glCtx?.constructor?.name ?? "none");

  const _glCanvas = new Proxy(_realGLCanvas, {
    get(target, prop) {
      if (prop === "getContext") {
        return (type, attrs) => {
          if (type === "webgl2" || type === "webgl") return _glCtx;
          return target.getContext(type, attrs);
        };
      }
      const v = target[prop];
      return typeof v === "function" ? v.bind(target) : v;
    },
    set(target, prop, value) { target[prop] = value; return true; },
  });

  self.Module = { canvas: _glCanvas };

  const landmarker = await withTimeout(
    PoseLandmarker.createFromOptions(vision, {
      runningMode: "VIDEO",
      numPoses: 1,
      minPoseDetectionConfidence: 0.3,
      minPosePresenceConfidence: 0.3,
      minTrackingConfidence: 0.3,
      baseOptions: { modelAssetPath: "/pose_landmarker_lite.task", delegate: "CPU" },
    }),
    30000,
    "model load"
  );
  status("Pose model ready ✓");

  // Overlay skeleton canvas — plain 2D.
  const ctx = canvasEl.getContext("2d");

  // Offscreen 2D canvas used as detectForVideo input.
  // Passing HTMLVideoElement directly causes MediaPipe's WASM runtime to upload
  // the frame via WebGL textures (activeTexture crash) even with CPU delegate.
  // Drawing the frame to a 2D canvas first forces CPU pixel read.
  const offscreen    = document.createElement("canvas");
  offscreen.width    = 640;
  offscreen.height   = 480;
  const offscreenCtx = offscreen.getContext("2d");

  let animFrameId   = null;
  let lastVideoTime = -1;
  let frameCount    = 0;
  let detectedCount = 0;

  // Smoothed landmark positions for stable dot rendering
  let smoothedLandmarks = null;
  const LERP_FACTOR = 0.6; // Higher = more responsive, lower = smoother

  function syncCanvasSize() {
    const w = videoEl.videoWidth  || 640;
    const h = videoEl.videoHeight || 480;
    if (canvasEl.width !== w || canvasEl.height !== h) {
      canvasEl.width  = w;
      canvasEl.height = h;
    }
    if (offscreen.width !== w || offscreen.height !== h) {
      offscreen.width  = w;
      offscreen.height = h;
    }
  }

  function lerpLandmarks(raw) {
    if (!smoothedLandmarks) {
      smoothedLandmarks = raw.map(lm => ({ ...lm }));
      return smoothedLandmarks;
    }
    for (let i = 0; i < raw.length; i++) {
      if (!raw[i] || (raw[i].visibility ?? 0) < 0.3) continue;
      if (!smoothedLandmarks[i]) { smoothedLandmarks[i] = { ...raw[i] }; continue; }
      smoothedLandmarks[i].x += (raw[i].x - smoothedLandmarks[i].x) * LERP_FACTOR;
      smoothedLandmarks[i].y += (raw[i].y - smoothedLandmarks[i].y) * LERP_FACTOR;
      smoothedLandmarks[i].visibility = raw[i].visibility;
    }
    return smoothedLandmarks;
  }

  function drawSkeleton(rawLandmarks) {
    const landmarks = lerpLandmarks(rawLandmarks);
    const w = canvasEl.width;
    const h = canvasEl.height;
    const vis = (i) => (landmarks[i]?.visibility ?? 0) >= 0.4;

    // Coloured connection segments
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    for (const seg of SEGMENTS) {
      ctx.strokeStyle = seg.color;
      for (const [a, b] of seg.pairs) {
        if (!vis(a) || !vis(b)) continue;
        ctx.beginPath();
        ctx.moveTo(landmarks[a].x * w, landmarks[a].y * h);
        ctx.lineTo(landmarks[b].x * w, landmarks[b].y * h);
        ctx.stroke();
      }
    }

    // Joint dots — coloured by body region, sized by importance
    const BIG = new Set([11,12,13,14,15,16,23,24,25,26,27,28]);
    for (let i = 0; i < landmarks.length; i++) {
      const lm = landmarks[i];
      if (!lm || (lm.visibility ?? 0) < 0.4) continue;
      const radius = BIG.has(i) ? 6 : 4;
      ctx.beginPath();
      ctx.arc(lm.x * w, lm.y * h, radius, 0, Math.PI * 2);
      ctx.fillStyle = dotColor(i);
      ctx.fill();
      ctx.strokeStyle = "rgba(0,0,0,0.4)";
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  }

  function drawFrame() {
    animFrameId = requestAnimationFrame(drawFrame);
    if (videoEl.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
      if (frameCount === 0) console.log("[poseTracker] waiting for video readyState, current:", videoEl.readyState);
      return;
    }

    syncCanvasSize();
    ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);

    const now = performance.now();
    // Use time-based throttle (~30 fps) instead of currentTime equality
    // which can be unreliable with some webcam streams.
    if (now - lastVideoTime < 30) return;
    lastVideoTime = now;

    if (frameCount < 3) {
      console.log(`[poseTracker] frame ${frameCount}: readyState=${videoEl.readyState} currentTime=${videoEl.currentTime.toFixed(3)} size=${videoEl.videoWidth}x${videoEl.videoHeight}`);
    }

    let result;
    try {
      result = landmarker.detectForVideo(videoEl, now);
    } catch (e) {
      console.error("[poseTracker] detectForVideo THREW:", e.message, e);
      onStatus?.(`detectForVideo error: ${e.message}`);
      return;
    }

    frameCount++;
    const found = result.landmarks.length > 0;
    if (found) {
      detectedCount++;
      drawSkeleton(result.landmarks[0]);
      onPoseResult(result.landmarks[0], result.worldLandmarks[0]);
    }

    // Periodic diagnostic — visible in console and status bar
    if (frameCount % 60 === 0) {
      const msg = found
        ? `Person detected ✓ (frame ${frameCount})`
        : `Scanning… no person found (frame ${frameCount}) — step back, face camera`;
      console.log("[poseTracker]", msg, "| readyState:", videoEl.readyState, "currentTime:", videoEl.currentTime.toFixed(2));
      onStatus?.(msg);
    }
  }

  drawFrame();
  return { stop: () => cancelAnimationFrame(animFrameId) };
}

export async function startWebcam(videoEl) {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { width: 640, height: 480, facingMode: "user" },
    audio: false,
  });
  videoEl.srcObject = stream;
  await new Promise((resolve, reject) => {
    videoEl.onloadedmetadata = () => videoEl.play().then(resolve).catch(reject);
  });
}
