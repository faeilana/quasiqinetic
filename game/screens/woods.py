"""Woods level - placeholder scene + scaffolding."""

import math
import random

import pygame

from ..settings import SCREEN_HEIGHT, SCREEN_WIDTH, WOODS_THEME
from .base_game import BaseGameScreen


class WoodsScreen(BaseGameScreen):
    theme = WOODS_THEME

    def __init__(self, app):
        super().__init__(app)
        self.t = 0.0
        rng = random.Random(7)
        self.trees = [
            (rng.randint(0, SCREEN_WIDTH), rng.randint(40, 90), rng.randint(70, 130))
            for _ in range(14)
        ]
        self.fireflies = [
            (rng.randint(0, SCREEN_WIDTH), rng.randint(150, SCREEN_HEIGHT - 100), rng.random() * math.tau)
            for _ in range(10)
        ]

    def on_enter(self):
        self.t = 0.0

    def update(self, dt):
        self.t += dt

    def draw_background(self, surface):
        theme = self.theme
        self._draw_sky(surface, theme)

        ground_y = SCREEN_HEIGHT - 120
        pygame.draw.rect(surface, theme["ground"], (0, ground_y, SCREEN_WIDTH, 120))

        self._draw_trees(surface, ground_y)
        self._draw_fireflies(surface)

    def _draw_sky(self, surface, theme):
        top, bottom = theme["sky_top"], theme["sky_bottom"]
        for y in range(SCREEN_HEIGHT):
            ratio = y / SCREEN_HEIGHT
            color = tuple(int(top[i] + (bottom[i] - top[i]) * ratio) for i in range(3))
            pygame.draw.line(surface, color, (0, y), (SCREEN_WIDTH, y))

    def _draw_trees(self, surface, ground_y):
        trunk_h = 24
        for x, width, height in self.trees:
            pygame.draw.rect(surface, (60, 42, 30), (x - 5, ground_y - trunk_h, 10, trunk_h))
            pygame.draw.polygon(
                surface,
                (30, 70, 40),
                [
                    (x, ground_y - trunk_h - height),
                    (x - width // 2, ground_y - trunk_h),
                    (x + width // 2, ground_y - trunk_h),
                ],
            )

    def _draw_fireflies(self, surface):
        for fx, fy, phase in self.fireflies:
            glow = 0.5 + 0.5 * math.sin(self.t * 2 + phase)
            color = (int(170 * glow) + 50, int(220 * glow) + 30, int(110 * glow))
            bob = int(8 * math.sin(self.t + phase))
            pygame.draw.circle(surface, color, (fx, fy + bob), 3)
