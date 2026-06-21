# QuasiQinetic

> We would rather grind in a game than grind at the gym. So we built QuasiQinetic, a wellness app that makes your body the controller and turns real movement into real play.

A browser-based gamified wellness app powered by real-time pose detection. No wearables. No downloads. Just your webcam and your body.

---

## Team

We are a team of 4: 2 humans, 2 AIs.

| | Name | Role |
|---|---|---|
| Human | Fae | CV / ML / backend |
| Human | Muzainah | Frontend / design |
| AI | Claude (Anthropic) | Architecture, game logic, dashboard, debugging |
| AI | Devin (Cognition) | Feature implementation, game mechanics |

Yes, really. The contributors list on this repo says it all.

---

## What it does

QuasiQinetic uses your webcam and MediaPipe pose estimation to detect your real-world movements and map them to in-game actions.

### Movement Runner
A 3D endless runner built in Three.js. Jump, duck, and lean left/right to dodge obstacles. Your body is the only controller.

### Fruit Ninja
A faithful port of the classic game. Swing your wrists in front of the camera to slice fruit. Each hand leaves its own glowing trail (cyan for left, orange for right).

### Wellness Dashboard
Tracks every session across both games and shows you:
- Joint activity heatmap on a body diagram (hover any dot for details)
- Calories burned per session and over time
- Movement breakdown (how many jumps, ducks, leans)
- Personal leaderboard so you can compete with friends on the same device

---

## Tech stack

| Layer | Tech |
|---|---|
| Pose detection | MediaPipe Tasks Vision (PoseLandmarker, VIDEO mode) |
| 3D runner | Three.js |
| Fruit Ninja + HUD | Canvas 2D |
| Frontend build | Vite (multi-page) |
| ML observability | Arize Phoenix |
| Error tracking | Sentry |
| Session storage | localStorage + JSON |

---

## Getting started

```bash
npm install
npm run dev
```

Open `http://localhost:5173` for the dashboard. The runner and Fruit Ninja launch from the PLAY button or directly at `/runner.html` and `/fruitninja.html`.

You will need a webcam. Step back far enough that your full body is visible, then raise your hand to start.

### Fruit Ninja (Python desktop version)

```bash
pip install -r requirements.txt
python fruitninja/screen.py
```

Sessions from the Python version are automatically picked up by the dashboard.

---

## Project structure

```
src/
  main.js          # Movement Runner entry point + game loop
  dashboard.js     # Dashboard logic
  poseTracker.js   # MediaPipe wrapper
  classifyPose.js  # Lean / jump / duck classifier
  poseHistory.js   # Landmark smoothing
  stats.js         # Session recording
  games/
    runner.js      # Three.js runner game
    fruitninja.js  # Canvas Fruit Ninja with wrist tracking
fruitninja/
  screen.py        # Python desktop Fruit Ninja
backend/
  SPEC.md          # FastAPI backend spec (in progress)
```

---

## Environment variables

Create a `.env` file in the project root:

```
VITE_SENTRY_DSN=your_sentry_dsn
VITE_BACKEND_URL=http://localhost:8000
```

Create `backend/.env` for the backend (never commit this):

```
ARIZE_SPACE_ID=your_space_id
ARIZE_API_KEY=your_api_key
```
