"""Train Station level - placeholder scene + scaffolding."""

import math

import pygame

from ..settings import SCREEN_HEIGHT, SCREEN_WIDTH, TRAIN_STATION_THEME
from .base_game import BaseGameScreen


class TrainStationScreen(BaseGameScreen):
    theme = TRAIN_STATION_THEME

    def __init__(self, app):
        super().__init__(app)
        self.t = 0.0

    def on_enter(self):
        self.t = 0.0

    def update(self, dt):
        self.t += dt

    def draw_background(self, surface):
        theme = self.theme
        self._draw_sky(surface, theme)

        platform_y = SCREEN_HEIGHT - 160
        pygame.draw.rect(surface, theme["ground"], (0, platform_y, SCREEN_WIDTH, 160))
        pygame.draw.line(surface, (90, 95, 105), (0, platform_y), (SCREEN_WIDTH, platform_y), 4)

        self._draw_pillars(surface, theme, platform_y)
        self._draw_tracks(surface, platform_y)

    def _draw_sky(self, surface, theme):
        top, bottom = theme["sky_top"], theme["sky_bottom"]
        for y in range(SCREEN_HEIGHT):
            ratio = y / SCREEN_HEIGHT
            color = tuple(int(top[i] + (bottom[i] - top[i]) * ratio) for i in range(3))
            pygame.draw.line(surface, color, (0, y), (SCREEN_WIDTH, y))

    def _draw_pillars(self, surface, theme, platform_y):
        for x in range(60, SCREEN_WIDTH, 180):
            pygame.draw.rect(surface, (55, 60, 72), (x, 90, 26, platform_y - 90))
            flicker = 0.7 + 0.3 * math.sin(self.t * 3 + x)
            glow_color = tuple(int(c * flicker) for c in theme["accent"])
            pygame.draw.circle(surface, glow_color, (x + 13, 95), 6)

    def _draw_tracks(self, surface, platform_y):
        for x in range(0, SCREEN_WIDTH, 40):
            pygame.draw.line(
                surface, (70, 72, 80), (x, platform_y + 60), (x + 20, SCREEN_HEIGHT), 4
            )
        pygame.draw.line(
            surface, (140, 142, 150), (0, platform_y + 110), (SCREEN_WIDTH, platform_y + 110), 6
        )
        pygame.draw.line(
            surface, (140, 142, 150), (0, platform_y + 140), (SCREEN_WIDTH, platform_y + 140), 6
        )
