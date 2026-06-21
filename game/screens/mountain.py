"""Mountain level - placeholder scene + scaffolding."""

import math
import random

import pygame

from ..settings import SCREEN_HEIGHT, SCREEN_WIDTH, MOUNTAIN_THEME
from .base_game import BaseGameScreen


class MountainScreen(BaseGameScreen):
    theme = MOUNTAIN_THEME

    def __init__(self, app):
        super().__init__(app)
        self.t = 0.0
        rng = random.Random(3)
        self.snowflakes = [
            (rng.randint(0, SCREEN_WIDTH), rng.randint(0, SCREEN_HEIGHT), rng.uniform(20, 60))
            for _ in range(40)
        ]

    def on_enter(self):
        self.t = 0.0

    def update(self, dt):
        self.t += dt

    def draw_background(self, surface):
        theme = self.theme
        self._draw_sky(surface, theme)
        self._draw_sun(surface)
        self._draw_peaks(surface)

        ground_y = SCREEN_HEIGHT - 90
        pygame.draw.rect(surface, theme["ground"], (0, ground_y, SCREEN_WIDTH, 90))

        self._draw_snow(surface)

    def _draw_sky(self, surface, theme):
        top, bottom = theme["sky_top"], theme["sky_bottom"]
        for y in range(SCREEN_HEIGHT):
            ratio = y / SCREEN_HEIGHT
            color = tuple(int(top[i] + (bottom[i] - top[i]) * ratio) for i in range(3))
            pygame.draw.line(surface, color, (0, y), (SCREEN_WIDTH, y))

    def _draw_sun(self, surface):
        pygame.draw.circle(surface, (255, 250, 230), (SCREEN_WIDTH - 120, 90), 40)

    def _draw_peaks(self, surface):
        far_peaks = [
            (0, 420), (180, 280), (380, 360), (600, 250),
            (820, 380), (1000, 300), (1000, 420), (0, 420),
        ]
        pygame.draw.polygon(surface, (170, 190, 205), far_peaks)

        near_peaks = [
            (-20, 480), (160, 220), (340, 420), (520, 200),
            (760, 440), (1020, 260), (1020, 480), (-20, 480),
        ]
        pygame.draw.polygon(surface, (140, 160, 178), near_peaks)

        for px, py in [(160, 220), (520, 200), (1020, 260)]:
            pygame.draw.polygon(
                surface,
                (255, 255, 255),
                [(px - 40, py + 40), (px, py), (px + 40, py + 40), (px, py + 18)],
            )

    def _draw_snow(self, surface):
        for fx, fy, speed in self.snowflakes:
            sway = math.sin(self.t + fx) * 6
            y = (fy + self.t * speed) % SCREEN_HEIGHT
            pygame.draw.circle(surface, (255, 255, 255), (int(fx + sway), int(y)), 2)
