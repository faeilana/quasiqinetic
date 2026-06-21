"""Constants and theme for the Fruit Ninja game mode.

Kept separate from `game/settings.py` so this mode can be tuned (and
later moved) without touching the runner levels.
"""

# -- Spawning / physics ----------------------------------------------------
GRAVITY = 900.0          # px/s^2, pulls fruit back down after a toss
SPAWN_INTERVAL = 0.9     # seconds between fruit tosses
MIN_LAUNCH_SPEED = 700.0 # px/s upward launch speed (min)
MAX_LAUNCH_SPEED = 950.0 # px/s upward launch speed (max)
FRUIT_RADIUS = 34        # px

# A miss = a fruit falling back off the bottom of the screen.
MAX_MISSES = 3

# -- Theme -----------------------------------------------------------------
# Mirrors the shape of the per-level theme dicts in game/settings.py so the
# screen can plug into the same scaffolding conventions later.
FRUIT_NINJA_THEME = {
    "key": "fruit_ninja",
    "name": "Fruit Ninja",
    "sky_top": (28, 16, 40),
    "sky_bottom": (70, 30, 60),
    "accent": (255, 120, 90),
    "ground": (24, 14, 30),
}

# A small palette of fruits: (name, body_color, highlight_color).
FRUITS = [
    ("watermelon", (54, 160, 70), (120, 210, 120)),
    ("orange", (255, 150, 40), (255, 200, 120)),
    ("apple", (220, 50, 50), (255, 120, 120)),
    ("lemon", (240, 220, 60), (255, 245, 150)),
    ("blueberry", (70, 90, 220), (140, 160, 255)),
]
