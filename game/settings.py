"""Global constants and shared configuration for Motion Runner."""

SCREEN_WIDTH = 1000
SCREEN_HEIGHT = 650
FPS = 60

GAME_TITLE = "MOTION RUNNER"

# -- Shared palette -------------------------------------------------------
WHITE = (255, 255, 255)
BLACK = (10, 10, 14)
DARK_GREY = (30, 33, 40)
LIGHT_GREY = (180, 185, 195)
ACCENT = (255, 196, 0)
ACCENT_SOFT = (255, 224, 130)

# -- Warm palette: shared by the landing and menu screens -----------------
WARM_BG_TOP = (255, 238, 214)
WARM_BG_BOTTOM = (255, 198, 150)
WARM_TITLE = (255, 150, 70)
WARM_TITLE_BRIGHT = (255, 90, 90)
WARM_TEXT_DARK = (110, 75, 60)
WARM_TEXT_MUTED = (160, 115, 95)

# -- Per-level theme palettes ----------------------------------------------
# Add/adjust colors here to retheme a level without touching draw code.
TRAIN_STATION_THEME = {
    "key": "train_station",
    "name": "Train Station",
    "sky_top": (18, 22, 34),
    "sky_bottom": (40, 46, 64),
    "accent": (255, 196, 0),
    "ground": (24, 26, 32),
}

WOODS_THEME = {
    "key": "woods",
    "name": "The Woods",
    "sky_top": (22, 48, 38),
    "sky_bottom": (58, 110, 74),
    "accent": (170, 230, 120),
    "ground": (32, 58, 36),
}

MOUNTAIN_THEME = {
    "key": "mountain",
    "name": "The Mountain",
    "sky_top": (130, 190, 230),
    "sky_bottom": (225, 240, 245),
    "accent": (90, 110, 130),
    "ground": (210, 220, 225),
}
