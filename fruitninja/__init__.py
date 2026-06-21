"""Fruit Ninja game mode.

A second game option alongside the Subway-Surfers-style runner levels.
Fruits are tossed up from the bottom of the screen and the player slices
them - eventually driven by webcam hand-tracking from
`tracking/pose_tracker.py`, with the mouse as a stand-in for now.

See README.md in this folder for how to wire it into the main app.
"""

from .settings import FRUIT_NINJA_THEME
from .fruit import Fruit
from .screen import FruitNinjaScreen

__all__ = ["FruitNinjaScreen", "Fruit", "FRUIT_NINJA_THEME"]
