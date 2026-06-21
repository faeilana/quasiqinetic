# Fruit Ninja mode

A second game option alongside the Subway-Surfers-style runner levels.
Fruits are tossed up from the bottom of the screen and the player slices
them; missing `MAX_MISSES` fruits ends the round.

Input is the mouse pointer for now (click or click-drag to slice). The
long-term plan is to drive `slice_at(point)` with a webcam hand position
from `tracking/pose_tracker.py` instead of the mouse.

## Files

```
fruitninja/
  __init__.py    exports FruitNinjaScreen, Fruit, FRUIT_NINJA_THEME
  settings.py    physics, spawn rate, theme + fruit palette
  fruit.py       Fruit entity (projectile physics + drawing)
  screen.py      FruitNinjaScreen (BaseScreen-compatible game screen)
```

`screen.py` builds on the same `BaseScreen` interface as the runner
levels (`game/screens/base.py`).

## Wiring (already done)

The mode is registered and playable from the level-select menu:

- `App.__init__` (`game/app.py`) registers it under the `"fruit_ninja"`
  key.
- `MenuScreen._build_options` (`game/screens/menu.py`) adds a 4th card
  pointing at that key.

You can also smoke-test the screen on its own:

```python
import pygame
from game.settings import SCREEN_WIDTH, SCREEN_HEIGHT
from fruitninja import FruitNinjaScreen

pygame.init()
screen = pygame.display.set_mode((SCREEN_WIDTH, SCREEN_HEIGHT))
clock = pygame.time.Clock()

class _Stub:
    def change_screen(self, key):
        pass

s = FruitNinjaScreen(_Stub())
running = True
while running:
    dt = clock.tick(60) / 1000.0
    for e in pygame.event.get():
        if e.type == pygame.QUIT:
            running = False
        else:
            s.handle_event(e)
    s.update(dt)
    s.draw(screen)
    pygame.display.flip()
pygame.quit()
```
