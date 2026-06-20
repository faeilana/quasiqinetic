"""Bundled font loading - keeps the warm landing/menu look consistent
with web/landing.html and web/menu.html, instead of relying on whatever
system fonts happen to be installed.
"""

from pathlib import Path

import pygame

FONTS_DIR = Path(__file__).resolve().parent.parent / "assets" / "fonts"

LUCKIEST_GUY = FONTS_DIR / "LuckiestGuy-Regular.ttf"
BALOO2_MEDIUM = FONTS_DIR / "Baloo2-Medium.ttf"
BALOO2_BOLD = FONTS_DIR / "Baloo2-Bold.ttf"


def luckiest_guy(size):
    return pygame.font.Font(LUCKIEST_GUY, size)


def baloo2(size, bold=False):
    return pygame.font.Font(BALOO2_BOLD if bold else BALOO2_MEDIUM, size)
