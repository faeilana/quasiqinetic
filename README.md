# Motion Runner

App shell for a computer-vision-controlled runner game (think Subway
Surfers, controlled by jumping and leaning in front of a webcam). This
shell covers the landing screen, level-select menu, and three themed
level screens (Train Station, Woods, Mountain) as static placeholders.
No webcam/CV logic is wired in yet - see "Next steps" below.

## Setup (VS Code)

1. Open this folder in VS Code (`File > Open Folder...`).
2. Make sure the Python extension is installed, then create a virtual
   environment: open a terminal (`` Ctrl+` ``) and run:

   ```bash
   python3 -m venv .venv
   source .venv/bin/activate      # Windows: .venv\Scripts\activate
   pip install -r requirements.txt
   ```

3. In VS Code, select `.venv` as the interpreter (`Cmd/Ctrl+Shift+P` ->
   "Python: Select Interpreter").
4. Run it:
   - Press `F5` (uses the "Run Motion Runner" config in
     `.vscode/launch.json`), or
   - `python main.py` in the terminal.

## Controls

| Screen      | Input                                              |
|-------------|-----------------------------------------------------|
| Landing     | `ENTER` / `SPACE` / click -> go to menu              |
| Menu        | `<-` `->` or mouse hover to select, `ENTER`/click to play, `ESC` to go back |
| Level       | `ESC` or the "< Menu" button -> back to menu         |

## Project structure

```
motion_runner/
  main.py                   entry point
  requirements.txt
  .vscode/
    launch.json              F5 run config
    settings.json
  game/
    app.py                   screen-state machine + main loop
    settings.py               window size, colors, per-level themes
    screens/
      base.py                 BaseScreen interface
      landing.py               title screen
      menu.py                  level-select (3 cards)
      base_game.py             shared scaffold for level screens
      train_station.py         Train Station placeholder level
      woods.py                  Woods placeholder level
      mountain.py                Mountain placeholder level
  tracking/
    pose_tracker.py           stub for webcam jump/lean detection (not wired in)
  assets/                     drop sprites/fonts here later (currently unused)
```

Everything you see on screen right now is drawn procedurally with
pygame shapes/gradients - there are no image assets to manage yet.

## Adding a 4th level

1. Add a theme dict to `game/settings.py`.
2. Create `game/screens/<level>.py` subclassing `BaseGameScreen` from
   `base_game.py`, set `theme = YOUR_THEME`, and override
   `draw_background` (and `update`, if it's animated).
3. Register it in `App.__init__` (`game/app.py`) and add a
   `MenuOption` for it in `MenuScreen._build_options` (`game/screens/menu.py`).

## Next steps (not yet built)

- **Player + gameplay**: lanes/position, obstacles, scoring, collision,
  per-level difficulty.
- **Webcam tracking**: implement `tracking/pose_tracker.py` with OpenCV
  + MediaPipe Pose (see the docstring in that file for a sketch) to
  detect jump and lean, then feed those events into each level screen's
  player controller instead of static placeholders.
- Uncomment `opencv-python` and `mediapipe` in `requirements.txt` once
  you start on that.
