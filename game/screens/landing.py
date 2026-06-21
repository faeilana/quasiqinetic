"""Title / landing screen - first thing players see."""

import math

import pygame

from ..fonts import baloo2, luckiest_guy
from ..settings import (
    GAME_TITLE,
    SCREEN_HEIGHT,
    SCREEN_WIDTH,
    WARM_BG_BOTTOM,
    WARM_BG_TOP,
    WARM_TEXT_DARK,
    WARM_TEXT_MUTED,
    WARM_TITLE,
    WARM_TITLE_BRIGHT,
    WARM_TITLE_OUTLINE,
)
from .base import BaseScreen

OUTLINE_OFFSETS = [(-2, 0), (2, 0), (0, -2), (0, 2), (-2, -2), (2, -2), (-2, 2), (2, 2)]


class LandingScreen(BaseScreen):
    def __init__(self, app):
        super().__init__(app)
        self.title_font = luckiest_guy(64)
        self.subtitle_font = baloo2(20, bold=True)
        self.hint_font = baloo2(16)
        self.t = 0.0

    def on_enter(self):
        self.t = 0.0

    def handle_event(self, event):
        if event.type == pygame.KEYDOWN and event.key in (pygame.K_RETURN, pygame.K_SPACE):
            self.app.change_screen("menu")
        elif event.type == pygame.MOUSEBUTTONDOWN:
            self.app.change_screen("menu")

    def update(self, dt):
        self.t += dt

    def draw(self, surface):
        self._draw_background(surface)
        self._draw_title(surface)
        self._draw_subtitle(surface)
        self._draw_hint(surface)

    def _draw_background(self, surface):
        for y in range(0, SCREEN_HEIGHT, 2):
            ratio = y / SCREEN_HEIGHT
            color = tuple(
                int(WARM_BG_TOP[i] + (WARM_BG_BOTTOM[i] - WARM_BG_TOP[i]) * ratio)
                for i in range(3)
            )
            pygame.draw.line(surface, color, (0, y), (SCREEN_WIDTH, y))
            pygame.draw.line(surface, color, (0, y + 1), (SCREEN_WIDTH, y + 1))

    def _draw_title(self, surface):
        pulse = 0.5 + 0.5 * math.sin(self.t * 2.2)
        title_color = tuple(
            int(WARM_TITLE_BRIGHT[i] * pulse + WARM_TITLE[i] * (1 - pulse)) for i in range(3)
        )
        x = SCREEN_WIDTH // 2 - self.title_font.size(GAME_TITLE)[0] // 2
        y = SCREEN_HEIGHT // 2 - 130

        outline_surf = self.title_font.render(GAME_TITLE, True, WARM_TITLE_OUTLINE)
        for dx, dy in OUTLINE_OFFSETS:
            surface.blit(outline_surf, (x + dx, y + dy))

        title_surf = self.title_font.render(GAME_TITLE, True, title_color)
        surface.blit(title_surf, (x, y))

    def _draw_subtitle(self, surface):
        subtitle = self.subtitle_font.render(
            "Jump. Lean. Run. Controlled by YOU.", True, WARM_TEXT_DARK
        )
        surface.blit(
            subtitle,
            (SCREEN_WIDTH // 2 - subtitle.get_width() // 2, SCREEN_HEIGHT // 2 - 50),
        )

    def _draw_hint(self, surface):
        if int(self.t * 1.5) % 2 != 0:
            return
        hint = self.hint_font.render(
            "Press ENTER or click to continue", True, WARM_TEXT_MUTED
        )
        surface.blit(
            hint,
            (SCREEN_WIDTH // 2 - hint.get_width() // 2, SCREEN_HEIGHT // 2 + 60),
        )
