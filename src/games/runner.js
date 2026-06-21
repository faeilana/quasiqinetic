// 3D endless runner using Three.js — Subway Surfers camera angle.
// Public API: createRunner(canvas) → { start, update, render, drawHUD, getPhase, getScore }
// render()        — Three.js renders to the WebGL canvas
// drawHUD(ctx)    — draws 2D hearts/coins/score/overlays on a separate overlay canvas

import * as THREE from 'three';

export const CANVAS_W = 800;
export const CANVAS_H = 400;

const WIN_COINS = 30;
const LANE_X    = [-3.5, 0, 3.5];   // world-x centre of each lane
const SPAWN_Z   = -90;              // obstacles/coins start here (far)
const TRACK_W   = 13;               // total track width

const lerp    = (a, b, t) => a + (b - a) * t;
const easeOut = t          => 1 - (1 - t) ** 2;

// ── Factory ────────────────────────────────────────────────────────────────────
export function createRunner(canvas) {

  // ── Renderer ───────────────────────────────────────────────────────────────
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setSize(CANVAS_W, CANVAS_H);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  const scene  = new THREE.Scene();
  scene.background = new THREE.Color(0x030211);
  scene.fog        = new THREE.FogExp2(0x030211, 0.020);

  const camera = new THREE.PerspectiveCamera(58, CANVAS_W / CANVAS_H, 0.1, 200);
  camera.position.set(0, 4.5, 11);
  camera.lookAt(0, 1, 0);

  // ── Lighting ───────────────────────────────────────────────────────────────
  scene.add(new THREE.AmbientLight(0x1a0a3a, 3));
  const sun = new THREE.DirectionalLight(0xffffff, 0.5);
  sun.position.set(3, 10, 5);
  scene.add(sun);

  // Edge-strip glow lights (static, illuminate the track sides)
  const edgeLight1 = new THREE.PointLight(0x7c3aed, 2, 25);
  edgeLight1.position.set(-7, 0.5, 0);
  scene.add(edgeLight1);
  const edgeLight2 = new THREE.PointLight(0x7c3aed, 2, 25);
  edgeLight2.position.set(7, 0.5, 0);
  scene.add(edgeLight2);

  // ── Scrolling floor ────────────────────────────────────────────────────────
  const gc = document.createElement('canvas');
  gc.width = gc.height = 256;
  const gx = gc.getContext('2d');
  gx.fillStyle = '#0a0720';
  gx.fillRect(0, 0, 256, 256);
  gx.strokeStyle = 'rgba(100,60,220,0.7)';
  gx.lineWidth = 1.5;
  for (let i = 0; i <= 8; i++) {
    const p = i * 32;
    gx.beginPath(); gx.moveTo(p, 0); gx.lineTo(p, 256); gx.stroke();
    gx.beginPath(); gx.moveTo(0, p); gx.lineTo(256, p); gx.stroke();
  }
  const floorTex = new THREE.CanvasTexture(gc);
  floorTex.wrapS = THREE.RepeatWrapping;
  floorTex.wrapT = THREE.RepeatWrapping;
  floorTex.repeat.set(3, 30);

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(TRACK_W + 2, 200),
    new THREE.MeshStandardMaterial({ map: floorTex, roughness: 1, metalness: 0 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.z = -90;
  scene.add(floor);

  // Lane dividers — two thin glowing strips
  const divMat = new THREE.MeshStandardMaterial({ color: 0x5b21b6, emissive: 0x5b21b6, emissiveIntensity: 2 });
  for (const dx of [-1.75, 1.75]) {
    const d = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 200), divMat);
    d.position.set(dx, 0.03, -90);
    scene.add(d);
  }

  // Outer edge glow strips
  const edgeMat = new THREE.MeshStandardMaterial({ color: 0x7c3aed, emissive: 0x7c3aed, emissiveIntensity: 3 });
  for (const dx of [-(TRACK_W / 2 + 0.4), (TRACK_W / 2 + 0.4)]) {
    const e = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.1, 200), edgeMat);
    e.position.set(dx, 0.05, -90);
    scene.add(e);
  }

  // Distant city buildings (background atmosphere)
  const buildMat = new THREE.MeshStandardMaterial({ color: 0x0c0828, emissive: 0x4c1d95, emissiveIntensity: 0.2 });
  const windowMat = new THREE.MeshStandardMaterial({ color: 0xfbbf24, emissive: 0xfbbf24, emissiveIntensity: 1 });
  for (const [bx, bh, bz, bw] of [
    [-22, 14, -110, 5], [-15, 9, -105, 4], [-10, 18, -115, 6],
    [10,  12, -105, 4], [16,  7, -108, 5], [24, 16, -112, 6],
  ]) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, 3), buildMat);
    b.position.set(bx, bh / 2, bz);
    scene.add(b);
    // tiny window dots
    const win = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.1), windowMat);
    win.position.set(bx, bh * 0.6, bz + 1.6);
    scene.add(win);
  }

  // ── Player ─────────────────────────────────────────────────────────────────
  const pMat = new THREE.MeshStandardMaterial({ color: 0xe0f2fe, emissive: 0x38bdf8, emissiveIntensity: 0.55 });
  const lMat = new THREE.MeshStandardMaterial({ color: 0x7dd3fc, emissive: 0x38bdf8, emissiveIntensity: 0.4 });

  const playerGroup = new THREE.Group();
  scene.add(playerGroup);

  const bodyMesh = new THREE.Mesh(new THREE.BoxGeometry(0.72, 1.25, 0.42), pMat);
  bodyMesh.position.y = 1.1;
  playerGroup.add(bodyMesh);

  const headMesh = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 10), pMat);
  headMesh.position.y = 2.08;
  playerGroup.add(headMesh);

  const legGeo   = new THREE.BoxGeometry(0.25, 0.68, 0.25);
  const leftLeg  = new THREE.Mesh(legGeo, lMat);
  const rightLeg = new THREE.Mesh(legGeo, lMat);
  leftLeg.position.set(-0.22, 0.34, 0);
  rightLeg.position.set(0.22, 0.34, 0);
  playerGroup.add(leftLeg, rightLeg);

  const playerLight = new THREE.PointLight(0x38bdf8, 2.5, 8);
  playerLight.position.set(0, 1.5, 0.5);
  playerGroup.add(playerLight);

  // ── Live obstacle / coin lists ─────────────────────────────────────────────
  const liveObstacles = [];
  const liveCoins     = [];

  // ── Game state ─────────────────────────────────────────────────────────────
  let s = makeState();

  function makeState() {
    return {
      phase:          'idle',
      score:          0,
      speed:          0.13,
      frame:          0,
      lives:          3,
      lane:           1,
      prevLane:       1,
      laneT:          1,
      jumpY:          0,
      jumpV:          0,
      jumping:        false,
      ducking:        false,
      jumpLandCD:     0,
      startupCD:      60,
      invincF:        0,
      obstacleTimer:  0,
      coinTimer:      0,
      coinsCollected: 0,
    };
  }

  function clearLiveObjects() {
    for (const o of liveObstacles) scene.remove(o.mesh);
    for (const c of liveCoins)     scene.remove(c.mesh);
    liveObstacles.length = 0;
    liveCoins.length     = 0;
  }

  // ── Public API ─────────────────────────────────────────────────────────────
  function start() { clearLiveObjects(); s = makeState(); s.phase = 'playing'; }

  function update(action) {
    // Idle-scroll floor even outside playing phase
    floorTex.offset.y -= (s.phase === 'playing' ? s.speed : 0.06) * 0.013;

    if (s.phase !== 'playing') return;

    s.ducking = false;
    if (s.startupCD > 0) { s.startupCD--; } else { applyAction(action); }

    s.frame++;
    s.score = Math.floor(s.frame / 4);
    s.speed = Math.min(0.38, 0.13 + s.frame * 0.00018);

    // Lane interpolation
    if (s.laneT < 1) s.laneT = Math.min(1, s.laneT + 0.1);

    // Jump physics
    if (s.jumping) {
      s.jumpY += s.jumpV;
      s.jumpV -= 0.009;
      if (s.jumpY <= 0) { s.jumpY = 0; s.jumpV = 0; s.jumping = false; s.jumpLandCD = 40; }
    }
    if (s.jumpLandCD > 0) s.jumpLandCD--;
    if (s.invincF   > 0) s.invincF--;

    // Apply to player mesh
    const tx = lerp(LANE_X[s.prevLane], LANE_X[s.lane], easeOut(s.laneT));
    playerGroup.position.x = tx;

    if (s.ducking) {
      playerGroup.scale.y  = 0.52;
      playerGroup.position.y = -0.28;
    } else {
      playerGroup.scale.y  = 1;
      playerGroup.position.y = s.jumpY * 3.5;
    }

    // Running leg animation
    if (!s.jumping && !s.ducking) {
      const swing = Math.sin(s.frame * 0.32) * 0.6;
      leftLeg.rotation.x  =  swing;
      rightLeg.rotation.x = -swing;
    } else {
      leftLeg.rotation.x = rightLeg.rotation.x = 0;
    }

    // Invincibility blink
    playerGroup.visible = !(s.invincF > 0 && Math.floor(s.invincF / 6) % 2 === 0);

    // ── Obstacles ────────────────────────────────────────────────────────────
    s.obstacleTimer++;
    if (s.obstacleTimer >= 120) { spawnObstacle(); s.obstacleTimer = 0; }
    for (const o of liveObstacles) { o.z += s.speed; o.mesh.position.z = o.z; }
    for (let i = liveObstacles.length - 1; i >= 0; i--) {
      if (liveObstacles[i].z > 4) { scene.remove(liveObstacles[i].mesh); liveObstacles.splice(i, 1); }
    }

    // ── Coins ─────────────────────────────────────────────────────────────────
    s.coinTimer++;
    if (s.coinTimer >= 50) { spawnCoinRow(); s.coinTimer = 0; }
    for (const c of liveCoins) { c.z += s.speed; c.mesh.position.z = c.z; c.mesh.rotation.y += 0.07; }
    for (let i = liveCoins.length - 1; i >= 0; i--) {
      if (liveCoins[i].z > 4 || liveCoins[i].collected) {
        scene.remove(liveCoins[i].mesh); liveCoins.splice(i, 1);
      }
    }

    checkCollisions();
    collectCoins();
    if (s.coinsCollected >= WIN_COINS) s.phase = 'won';
  }

  function render() {
    renderer.render(scene, camera);
  }

  // Draw the 2D HUD (and phase overlays) onto a separate overlay canvas context.
  function drawHUD(ctx) {
    const W = CANVAS_W, H = CANVAS_H;
    ctx.clearRect(0, 0, W, H);

    if (s.phase === 'idle') { draw2DOverlay(ctx, 'MOVEMENT RUNNER', 'stand still to calibrate'); return; }

    // ── Hearts ──────────────────────────────────────────────────────────────
    for (let i = 0; i < 3; i++) {
      ctx.fillStyle    = i < s.lives ? '#f43f5e' : 'rgba(244,63,94,0.2)';
      ctx.font         = '18px sans-serif';
      ctx.textAlign    = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText('♥', 14 + i * 24, 14);
    }

    // ── Coin progress bar ────────────────────────────────────────────────────
    const bx = 14, by = 40, bw = 120, bh = 8;
    const pct = Math.min(1, s.coinsCollected / WIN_COINS);
    ctx.fillStyle = 'rgba(251,191,36,0.15)';
    fillRR(ctx, bx, by, bw, bh, 4);
    if (pct > 0) {
      ctx.fillStyle = '#fbbf24'; ctx.shadowColor = '#fbbf24'; ctx.shadowBlur = 6;
      fillRR(ctx, bx, by, bw * pct, bh, 4);
      ctx.shadowBlur = 0;
    }
    ctx.fillStyle = '#fbbf24'; ctx.font = 'bold 11px monospace';
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText(`${s.coinsCollected}/${WIN_COINS} coins`, bx + bw + 6, by);

    // ── Score ────────────────────────────────────────────────────────────────
    ctx.fillStyle = '#7dd3fc'; ctx.font = 'bold 15px monospace';
    ctx.textAlign = 'right'; ctx.textBaseline = 'top';
    ctx.fillText(`${s.score}m`, W - 14, 14);
    ctx.textAlign = 'left';

    // ── Phase overlays ───────────────────────────────────────────────────────
    if (s.phase === 'dead') draw2DOverlay(ctx, 'GAME OVER', `${s.score}m · ${s.coinsCollected} coins`);
    if (s.phase === 'won')  draw2DOverlay(ctx, 'YOU WIN!',  `${s.coinsCollected} coins — legendary!`);
  }

  function getPhase() { return s.phase; }
  function getScore() { return s.score; }

  return { start, update, render, drawHUD, getPhase, getScore };

  // ── Internals ──────────────────────────────────────────────────────────────
  function applyAction(action) {
    // Jump
    if (action === 'jump' && !s.jumping && s.jumpLandCD === 0 && s.laneT >= 1) {
      s.jumping = true; s.jumpY = 0; s.jumpV = 0.22;
    }
    // Duck
    s.ducking = action === 'duck';

    // Lane: direct body-position mapping — body left=lane 0, center=lane 1, right=lane 2.
    // Only trigger a lane transition once per zone entry (guard on s.lane !== target).
    let laneTgt = -1;
    if (action === 'lean_left')  laneTgt = 0;
    else if (action === 'lean_right') laneTgt = 2;
    else if (action === 'idle')  laneTgt = 1;
    // jump/duck don't change lane

    if (laneTgt !== -1 && laneTgt !== s.lane && s.laneT >= 0.85) {
      s.prevLane = s.lane; s.lane = laneTgt; s.laneT = 0;
    }
  }

  function collisionLane() { return s.laneT >= 0.5 ? s.lane : s.prevLane; }

  // ── Obstacle spawning ───────────────────────────────────────────────────────
  function spawnObstacle() {
    const lane = collisionLane();
    const type = Math.random() < 0.5 ? 'low' : 'high';
    const x    = LANE_X[lane];
    let mesh;

    if (type === 'low') {
      // Pink block sitting on the ground — player must JUMP
      const mat = new THREE.MeshStandardMaterial({ color: 0xc41058, emissive: 0xe11d6a, emissiveIntensity: 1 });
      mesh = new THREE.Mesh(new THREE.BoxGeometry(2.8, 1.3, 1.0), mat);
      mesh.position.set(x, 0.65, SPAWN_Z);
      const light = new THREE.PointLight(0xff2d78, 3, 12);
      light.position.set(0, 1, 0.5);
      mesh.add(light);
    } else {
      // Orange bar overhead — player must DUCK
      mesh = new THREE.Group();
      const barMat = new THREE.MeshStandardMaterial({ color: 0xc2440a, emissive: 0xea580c, emissiveIntensity: 1 });
      const pilMat = new THREE.MeshStandardMaterial({ color: 0xa33808, emissive: 0xc2440a, emissiveIntensity: 0.5 });
      const bar = new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.38, 0.8), barMat);
      bar.position.y = 1.8;
      mesh.add(bar);
      for (const px of [-1.2, 1.2]) {
        const pil = new THREE.Mesh(new THREE.BoxGeometry(0.2, 1.8, 0.3), pilMat);
        pil.position.set(px, 0.9, 0);
        mesh.add(pil);
      }
      const light = new THREE.PointLight(0xff6b35, 3, 12);
      light.position.set(0, 2, 0.5);
      mesh.add(light);
      mesh.position.set(x, 0, SPAWN_Z);
    }

    scene.add(mesh);
    liveObstacles.push({ lane, type, z: SPAWN_Z, mesh, consumed: false });
  }

  // ── Coin spawning ────────────────────────────────────────────────────────────
  function spawnCoinRow() {
    const geo = new THREE.CylinderGeometry(0.3, 0.3, 0.09, 16);
    const mat = new THREE.MeshStandardMaterial({ color: 0xfbbf24, emissive: 0xfbbf24, emissiveIntensity: 2.5 });
    for (let lane = 0; lane < 3; lane++) {
      const mesh = new THREE.Mesh(geo, mat.clone());
      mesh.position.set(LANE_X[lane], 1.1, SPAWN_Z);
      mesh.rotation.x = Math.PI / 2;
      const light = new THREE.PointLight(0xfbbf24, 1.5, 6);
      mesh.add(light);
      scene.add(mesh);
      liveCoins.push({ lane, z: SPAWN_Z, mesh, collected: false });
    }
  }

  // ── Collision ─────────────────────────────────────────────────────────────────
  function checkCollisions() {
    if (s.invincF > 0) return;
    const cl = collisionLane();
    for (const o of liveObstacles) {
      if (o.consumed || o.z < -4 || o.z > 2.5) continue;
      if (o.lane !== cl) continue;
      const jumpClear = o.type === 'low'  && s.jumpY > 0.35;
      const duckClear = o.type === 'high' && s.ducking;
      if (!jumpClear && !duckClear) {
        o.consumed = true; s.lives--; s.invincF = 90;
        if (s.lives <= 0) s.phase = 'dead';
      }
    }
  }

  function collectCoins() {
    const cl = collisionLane();
    for (const c of liveCoins) {
      if (c.collected || c.z < -4 || c.z > 2.5) continue;
      if (c.lane !== cl) continue;
      c.collected = true; s.coinsCollected++;
    }
  }

  // ── 2D overlay helper ─────────────────────────────────────────────────────────
  function draw2DOverlay(ctx, title, sub) {
    ctx.fillStyle = 'rgba(3,2,20,0.78)';
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.save();
    ctx.shadowColor = '#7c3aed'; ctx.shadowBlur = 32;
    ctx.fillStyle   = '#c4b5fd'; ctx.font = 'bold 38px monospace';
    ctx.fillText(title, CANVAS_W / 2, CANVAS_H / 2 - 22);
    ctx.restore();
    ctx.fillStyle = '#94a3b8'; ctx.font = '14px monospace';
    ctx.fillText(sub, CANVAS_W / 2, CANVAS_H / 2 + 20);
    ctx.textAlign = 'left';
  }

  function fillRR(ctx, x, y, w, h, r) {
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y, w, h, r);
    else ctx.rect(x, y, w, h);
    ctx.fill();
  }
}
