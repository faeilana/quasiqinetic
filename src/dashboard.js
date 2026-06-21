import { JOINT_ACTIVATION } from './stats.js';

const STORAGE_KEY = 'movement-runner-sessions';

// ── Joint positions on body image (% of image width/height) ─────────────────
// Tuned for a front-facing full-body figure (src/img/human_body.png, 500×500).
// Positions are [left%, top%] relative to the body image's rendered bounds.
// Tuned for src/img/human_body.png — arms-at-sides front-facing figure.
const JOINT_META = {
  leftShoulder:  { pos: [33, 21], label: 'Left Shoulder',  actions: ['lean_left'] },
  rightShoulder: { pos: [67, 21], label: 'Right Shoulder', actions: ['lean_right'] },
  leftElbow:     { pos: [27, 34], label: 'Left Elbow',     actions: [] },
  rightElbow:    { pos: [73, 34], label: 'Right Elbow',    actions: [] },
  leftWrist:     { pos: [24, 47], label: 'Left Wrist',     actions: [] },
  rightWrist:    { pos: [76, 47], label: 'Right Wrist',    actions: [] },
  spine:         { pos: [50, 27], label: 'Spine (Upper)',   actions: ['jump', 'lean_left', 'lean_right'] },
  lowerBack:     { pos: [50, 44], label: 'Lower Back',     actions: ['duck'] },
  leftHip:       { pos: [40, 54], label: 'Left Hip',       actions: ['jump', 'duck', 'lean_left', 'lean_right'] },
  rightHip:      { pos: [60, 54], label: 'Right Hip',      actions: ['jump', 'duck', 'lean_left', 'lean_right'] },
  leftKnee:      { pos: [39, 68], label: 'Left Knee',      actions: ['jump', 'duck'] },
  rightKnee:     { pos: [61, 68], label: 'Right Knee',     actions: ['jump', 'duck'] },
  leftAnkle:     { pos: [38, 83], label: 'Left Ankle',     actions: ['jump'] },
  rightAnkle:    { pos: [62, 83], label: 'Right Ankle',    actions: ['jump'] },
};

const ACTION_COLOR = {
  jump:       '#E9F95B',  // Lemony
  duck:       '#5F278B',  // Egyptian Purple
  lean_left:  '#D431A1',  // Juicy Purple
  lean_right: '#985DC7',  // Original Purple
};
const ACTION_LABEL = {
  jump: 'Jump', duck: 'Duck', lean_left: 'Lean Left', lean_right: 'Lean Right', idle: 'Idle',
};

// ── Load sessions ─────────────────────────────────────────────────────────────
function loadSessions() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]'); }
  catch { return []; }
}

// ── Aggregate joint heat across sessions ─────────────────────────────────────
function aggregateJointHeat(sessions) {
  const heat = {};
  for (const s of sessions) {
    for (const [j, v] of Object.entries(s.jointHeat ?? {})) {
      heat[j] = (heat[j] ?? 0) + v;
    }
  }
  return heat;
}

// ── Aggregate action counts ───────────────────────────────────────────────────
function aggregateActions(sessions) {
  const counts = {};
  for (const s of sessions) {
    for (const [a, c] of Object.entries(s.actionCounts ?? {})) {
      counts[a] = (counts[a] ?? 0) + c;
    }
  }
  return counts;
}

// ── Duration per date (for chart) ────────────────────────────────────────────
function durationByDate(sessions) {
  const map = {};
  for (const s of sessions) {
    if (!s.startTime || !s.endTime) continue;
    const key = new Date(s.startTime).toLocaleDateString('en-CA'); // YYYY-MM-DD
    const dur = (s.endTime - s.startTime) / 60000; // minutes
    map[key] = (map[key] ?? 0) + dur;
  }
  return map;
}

function getLast7Days() {
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    days.push(d.toLocaleDateString('en-CA'));
  }
  return days;
}

function fmtDate(iso) {
  const [, m, d] = iso.split('-');
  return `${m}/${d}`;
}

function fmtMs(ms) {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

// ── Heat tier (0–4) ──────────────────────────────────────────────────────────
function heatTier(val, max) {
  if (!max || val === 0) return 0;
  const r = val / max;
  if (r < 0.2) return 1;
  if (r < 0.5) return 2;
  if (r < 0.8) return 3;
  return 4;
}

// ── Draw duration chart on canvas ────────────────────────────────────────────
function drawDurationChart(canvas, byDate, days) {
  const dpr = window.devicePixelRatio || 1;
  const CW  = canvas.clientWidth  || canvas.parentElement.clientWidth  || 280;
  const CH  = canvas.clientHeight || canvas.parentElement.clientHeight || 230;
  canvas.width  = CW * dpr;
  canvas.height = CH * dpr;
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);

  const W = CW, H = CH;
  const PAD_L = 36, PAD_R = 8, PAD_T = 14, PAD_B = 28;
  const CHART_W = W - PAD_L - PAD_R;
  const CHART_H = H - PAD_T - PAD_B;

  // Background (light)
  ctx.fillStyle = '#FAF8FE';
  ctx.fillRect(0, 0, W, H);

  const vals = days.map(d => byDate[d] ?? 0);
  const maxVal = Math.max(...vals, 1);
  const n = days.length;
  const gap = 5;
  const barW = Math.floor((CHART_W - gap * (n - 1)) / n);

  // Horizontal grid lines + y-axis labels
  ctx.lineWidth = 1;
  for (let t = 0; t <= 4; t++) {
    const gy = PAD_T + CHART_H * (1 - t / 4);
    ctx.strokeStyle = 'rgba(95, 39, 139, 0.12)';
    ctx.beginPath(); ctx.moveTo(PAD_L, gy); ctx.lineTo(W - PAD_R, gy); ctx.stroke();
    const label = Math.round(maxVal * t / 4);
    ctx.fillStyle = 'rgba(123, 94, 167, 0.85)';
    ctx.font = `9px Inter, sans-serif`;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText(label > 0 ? `${label}m` : '0', PAD_L - 4, gy);
  }

  // Bars
  for (let i = 0; i < n; i++) {
    const v = vals[i];
    const barH = v > 0 ? Math.max(4, (v / maxVal) * CHART_H) : 0;
    const bx = PAD_L + i * (barW + gap);
    const by = PAD_T + CHART_H - barH;

    if (barH > 0) {
      // Gradient fill: Juicy Purple at bottom → Egyptian Purple mid → Lemony at top
      const grad = ctx.createLinearGradient(bx, by + barH, bx, by);
      grad.addColorStop(0,   '#D431A1');
      grad.addColorStop(0.4, '#5F278B');
      grad.addColorStop(1,   '#E9F95B');
      ctx.fillStyle = grad;
      ctx.fillRect(bx, by, barW, barH);

      // Scanline effect — horizontal dark lines every 3px
      ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
      for (let sy = by + 1; sy < by + barH; sy += 3) {
        ctx.fillRect(bx, sy, barW, 1);
      }

      // Top highlight cap (Lemony)
      ctx.fillStyle = 'rgba(233, 249, 91, 0.8)';
      ctx.fillRect(bx, by, barW, 2);

      // Glow border (Juicy Purple)
      ctx.save();
      ctx.shadowColor = '#D431A1';
      ctx.shadowBlur = 6;
      ctx.strokeStyle = 'rgba(212, 49, 161, 0.4)';
      ctx.lineWidth = 0.5;
      ctx.strokeRect(bx + 0.5, by + 0.5, barW - 1, barH - 1);
      ctx.restore();

      // Duration label on tall bars (dark, readable on colored bar)
      if (barH > 22) {
        ctx.fillStyle = 'rgba(26, 10, 53, 0.9)';
        ctx.font = `bold 9px Inter, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText(`${Math.round(v)}m`, bx + barW / 2, by + 4);
      }
    }

    // Date label
    ctx.fillStyle = v > 0 ? 'rgba(57, 41, 137, 0.85)' : 'rgba(95, 39, 139, 0.3)';
    ctx.font = `9px Inter, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(fmtDate(days[i]), bx + barW / 2, PAD_T + CHART_H + 6);
  }
}

// ── Render joint dots on body image ──────────────────────────────────────────
function renderJointDots(container, img, heatMap, sessions) {
  container.querySelectorAll('.joint-dot').forEach(el => el.remove());

  const maxHeat = Math.max(...Object.values(heatMap), 1);
  const tooltip = document.getElementById('joint-tooltip');

  for (const [jointKey, meta] of Object.entries(JOINT_META)) {
    const dot = document.createElement('div');
    dot.className = 'joint-dot';
    const tier = heatTier(heatMap[jointKey] ?? 0, maxHeat);
    dot.classList.add(`heat-${tier}`);
    dot.style.left = `${meta.pos[0]}%`;
    dot.style.top  = `${meta.pos[1]}%`;
    dot.dataset.joint = jointKey;

    dot.addEventListener('mouseenter', (e) => {
      const heat = heatMap[jointKey] ?? 0;
      const pct  = maxHeat > 0 ? (heat / maxHeat) : 0;

      // Per-action contributions
      const contribs = [];
      for (const action of meta.actions) {
        const pts   = JOINT_ACTIVATION[action]?.[jointKey] ?? 0;
        const count = sessions.reduce((s, sess) => s + (sess.actionCounts?.[action] ?? 0), 0);
        if (count > 0 && pts > 0) contribs.push({ action, pts, count });
      }
      contribs.sort((a, b) => b.pts * b.count - a.pts * a.count);

      const tierLabel = ['None', 'Low', 'Medium', 'High', 'Peak'][tier];
      const tierColor = ['rgba(57,41,137,0.4)', '#5F278B', '#985DC7', '#D431A1', '#E9F95B'][tier];

      let html = `<div class="tt-name">${meta.label}</div>`;
      html += `<div class="tt-row"><span class="tt-label">Activity level</span><span class="tt-val" style="color:${tierColor}">${tierLabel}</span></div>`;
      html += `<div class="tt-row"><span class="tt-label">Total score</span><span class="tt-val" style="color:#392989">${heat.toLocaleString()}</span></div>`;
      if (contribs.length > 0) {
        html += `<div class="tt-row" style="margin-top:5px;padding-top:5px;border-top:1px solid rgba(80,40,160,0.3)"><span class="tt-label">Used in</span></div>`;
        for (const c of contribs.slice(0, 3)) {
          html += `<div class="tt-row"><span class="tt-label" style="color:${ACTION_COLOR[c.action] ?? '#a78bfa'}">${ACTION_LABEL[c.action]}</span><span class="tt-val">${c.count}× (${c.pts}pt/rep)</span></div>`;
        }
      }
      html += `<div class="tt-heat-bar"><div class="tt-heat-fill" style="width:${Math.round(pct*100)}%;background:${tierColor}"></div></div>`;

      tooltip.innerHTML = html;
      tooltip.style.display = 'block';
      moveTooltip(e);
    });

    dot.addEventListener('mousemove', moveTooltip);
    dot.addEventListener('mouseleave', () => { tooltip.style.display = 'none'; });
    container.appendChild(dot);
  }

  function moveTooltip(e) {
    let x = e.clientX + 14;
    let y = e.clientY - 10;
    const tw = tooltip.offsetWidth || 200;
    const th = tooltip.offsetHeight || 140;
    if (x + tw > window.innerWidth  - 8) x = e.clientX - tw - 14;
    if (y + th > window.innerHeight - 8) y = e.clientY - th - 10;
    tooltip.style.left = `${x}px`;
    tooltip.style.top  = `${y}px`;
  }
}

// ── Right panel stat cards ────────────────────────────────────────────────────
function renderRightPanel(sessions) {
  if (sessions.length === 0) return;

  const latest   = sessions[0];
  const totalCal = sessions.reduce((s, x) => s + (x.calories ?? 0), 0);
  document.getElementById('cal-latest').textContent = Math.round(latest.calories ?? 0);
  document.getElementById('cal-total').textContent  = Math.round(totalCal);

  // Movement breakdown
  const allCounts  = aggregateActions(sessions);
  const moveActions = ['jump', 'duck', 'lean_left', 'lean_right'];
  const maxCount   = Math.max(...moveActions.map(a => allCounts[a] ?? 0), 1);
  document.getElementById('move-list').innerHTML = moveActions.map(a => {
    const c   = allCounts[a] ?? 0;
    const pct = Math.round((c / maxCount) * 100);
    return `
      <div class="move-row">
        <span class="move-label">${ACTION_LABEL[a]}</span>
        <div class="move-track"><div class="move-fill" style="width:${pct}%;background:${ACTION_COLOR[a]}"></div></div>
        <span class="move-count">${c}</span>
      </div>`;
  }).join('');

  // Top joints
  const heatMap  = aggregateJointHeat(sessions);
  const topJoints = Object.entries(heatMap).sort(([,a],[,b]) => b - a).slice(0, 6);
  const maxHeat  = topJoints[0]?.[1] ?? 1;
  document.getElementById('joint-list').innerHTML = topJoints.map(([j, v]) => {
    const label = JOINT_META[j]?.label ?? j;
    const pct   = Math.round((v / maxHeat) * 100);
    const color = ['rgba(57,41,137,0.4)', '#5F278B', '#985DC7', '#D431A1', '#E9F95B'][heatTier(v, maxHeat)];
    return `
      <div class="joint-row">
        <span class="joint-row-label">${label}</span>
        <div class="joint-track"><div class="joint-fill" style="width:${pct}%;background:${color}"></div></div>
        <span class="joint-score">${v}</span>
      </div>`;
  }).join('');

  // Latest session card
  const dur  = latest.endTime && latest.startTime ? fmtMs(latest.endTime - latest.startTime) : '—';
  const when = latest.startTime ? new Date(latest.startTime).toLocaleString() : '—';
  const topJ = Object.entries(latest.jointHeat ?? {}).sort(([,a],[,b]) => b - a)[0];
  document.getElementById('session-card').innerHTML = `
    <div class="session-stat"><span class="session-key">When</span><span class="session-val" style="font-size:10px">${when}</span></div>
    <div class="session-stat"><span class="session-key">Duration</span><span class="session-val">${dur}</span></div>
    <div class="session-stat"><span class="session-key">Score</span><span class="session-val">${latest.score ?? 0}m</span></div>
    <div class="session-stat"><span class="session-key">Calories</span><span class="session-val">${Math.round(latest.calories ?? 0)} kcal</span></div>
    ${topJ ? `<div class="session-stat"><span class="session-key">Hottest joint</span><span class="session-val" style="color:#e11d6a">${JOINT_META[topJ[0]]?.label ?? topJ[0]}</span></div>` : ''}
  `;
}

// ── Summary stats ─────────────────────────────────────────────────────────────
function renderSummary(sessions) {
  document.getElementById('stat-sessions').textContent = sessions.length || '—';
  const best = sessions.reduce((m, s) => Math.max(m, s.score ?? 0), 0);
  document.getElementById('stat-best').textContent = best > 0 ? `${best}m` : '—';
  const totalMs = sessions.reduce((s, x) => {
    if (!x.startTime || !x.endTime) return s;
    return s + (x.endTime - x.startTime);
  }, 0);
  document.getElementById('stat-duration').textContent = totalMs > 0 ? fmtMs(totalMs) : '—';
}

// ── Load Fruit Ninja sessions from public/fruitninja-sessions.json ───────────
async function loadNinjaSessions() {
  try {
    const res = await fetch('/fruitninja-sessions.json');
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
}

function fmtMs2(ms) {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

function renderNinjaPanel(sessions) {
  if (sessions.length === 0) {
    document.getElementById('ninja-no-sessions').style.display = '';
    document.getElementById('ninja-stats').closest('.panel').style.display = 'none';
    document.getElementById('ninja-history').closest('.panel').style.display = 'none';
    document.getElementById('ninja-cal-latest').textContent = '—';
    document.getElementById('ninja-cal-total').textContent  = '—';
    return;
  }

  const latest   = sessions[0];
  const totalCal = sessions.reduce((s, x) => s + (x.calories ?? 0), 0);
  document.getElementById('ninja-cal-latest').textContent = Math.round(latest.calories ?? 0);
  document.getElementById('ninja-cal-total').textContent  = Math.round(totalCal);

  // Summary stats
  const bestScore = Math.max(...sessions.map(s => s.score ?? 0));
  const avgScore  = Math.round(sessions.reduce((s, x) => s + (x.score ?? 0), 0) / sessions.length);
  const totalSessions = sessions.length;
  document.getElementById('ninja-stats').innerHTML = [
    { label: 'Sessions played', val: totalSessions, color: '#392989' },
    { label: 'Best score',      val: bestScore,     color: '#D431A1' },
    { label: 'Average score',   val: avgScore,      color: '#985DC7' },
  ].map(({ label, val, color }) => `
    <div class="move-row">
      <span class="move-label">${label}</span>
      <div class="move-track">
        <div class="move-fill" style="width:${Math.min(100, Math.round(val / Math.max(bestScore, 1) * 100))}%;background:${color}"></div>
      </div>
      <span class="move-count">${val}</span>
    </div>`).join('');

  // Recent session list
  document.getElementById('ninja-history').innerHTML = sessions.slice(0, 8).map(s => {
    const dur  = s.startTime && s.endTime ? fmtMs2(s.endTime - s.startTime) : '—';
    const when = s.startTime ? new Date(s.startTime).toLocaleDateString() : '—';
    return `
      <div class="joint-row" style="grid-template-columns:60px 1fr 38px 36px">
        <span class="joint-row-label" style="font-size:10px;color:#392989;font-weight:700">${s.score ?? 0}</span>
        <div class="joint-track">
          <div class="joint-fill" style="width:${Math.min(100, Math.round((s.score ?? 0) / Math.max(bestScore, 1) * 100))}%;background:#D431A1"></div>
        </div>
        <span class="joint-score" style="color:#985DC7">${dur}</span>
        <span class="joint-score">${when}</span>
      </div>`;
  }).join('');
}

// ── Game selector ────────────────────────────────────────────────────────────
function initGameSelector() {
  const btnRunner     = document.getElementById('btn-runner');
  const btnNinja      = document.getElementById('btn-ninja');
  const runnerContent = document.getElementById('runner-content');
  const ninjaContent  = document.getElementById('ninja-content');
  const playBtn       = document.getElementById('play-btn');

  btnRunner.addEventListener('click', () => {
    btnRunner.classList.add('active');
    btnNinja.classList.remove('active');
    runnerContent.style.display = '';
    ninjaContent.style.display  = 'none';
    playBtn.href        = '/';
    playBtn.textContent = '▶ PLAY';
    playBtn.title       = '';
    playBtn.style.opacity      = '';
    playBtn.style.cursor       = '';
    playBtn.onclick            = null;
  });
  btnNinja.addEventListener('click', () => {
    btnNinja.classList.add('active');
    btnRunner.classList.remove('active');
    runnerContent.style.display = 'none';
    ninjaContent.style.display  = 'flex';
    playBtn.removeAttribute('href');
    playBtn.textContent = '▶ python main.py';
    playBtn.title       = 'Fruit Ninja runs as a desktop app — launch it from your terminal';
    playBtn.style.opacity      = '0.65';
    playBtn.style.cursor       = 'default';
    playBtn.onclick            = (e) => e.preventDefault();
  });
}

// ── Init ─────────────────────────────────────────────────────────────────────
async function init() {
  const sessions      = loadSessions();
  const ninjaSessions = await loadNinjaSessions();
  const heatMap  = aggregateJointHeat(sessions);
  const byDate   = durationByDate(sessions);
  const days     = getLast7Days();

  renderSummary(sessions);
  if (sessions.length > 0) renderRightPanel(sessions);
  renderNinjaPanel(ninjaSessions);
  initGameSelector();

  // Joint dots — after image loads, lock container to exact image size so
  // %-positioned dots align precisely to the body image (not the flex parent).
  const img       = document.getElementById('body-img');
  const container = document.getElementById('body-container');

  function doJoints() {
    // Force container to match rendered image dimensions
    container.style.width  = `${img.clientWidth}px`;
    container.style.height = `${img.clientHeight}px`;
    renderJointDots(container, img, heatMap, sessions);
  }

  if (img.complete && img.naturalWidth > 0) {
    requestAnimationFrame(doJoints);
  } else {
    img.addEventListener('load', () => requestAnimationFrame(doJoints));
  }

  // Re-align on resize
  window.addEventListener('resize', () => {
    container.style.width  = `${img.clientWidth}px`;
    container.style.height = `${img.clientHeight}px`;
  });

  // Chart — rAF lets CSS settle so clientWidth is accurate
  const chartCanvas = document.getElementById('duration-chart');
  requestAnimationFrame(() => drawDurationChart(chartCanvas, byDate, days));
  window.addEventListener('resize', () => drawDurationChart(chartCanvas, byDate, days));
}

init();
