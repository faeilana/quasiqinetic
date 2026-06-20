"""Shared scaffolding for the three playable level screens.

Each level currently renders a themed, lightly-animated backdrop with a
"Coming Soon" placeholder and a back-to-menu button. To build out real
gameplay:

  1. Override `draw_background` / `update_scene` in the subclass for
     level-specific scenery (already done) and obstacles/track (TODO).
  2. Add a player character + lane/position logic.
  3. Hook up `tracking/pose_tracker.py` so jump/lean events drive the
     player instead of this placeholder screen.
"""

import pygame

from ..fonts import baloo2, luckiest_guy
from ..settings import SCREEN_HEIGHT, SCREEN_WIDTH, WHITE
from .base import BaseScreen


class BaseGameScreen(BaseScreen):
    theme = None  # each subclass must set this to one of the *_THEME dicts

    def __init__(self, app):
        super().__init__(app)
        self.title_font = luckiest_guy(40)
        self.status_font = baloo2(20, bold=True)
        self.hint_font = baloo2(14)
        self.back_rect = pygame.Rect(24, 24, 110, 40)

    def on_enter(self):
        pass

    def handle_event(self, event):
        if event.type == pygame.KEYDOWN and event.key == pygame.K_ESCAPE:
            self.app.change_screen("menu")
        elif event.type == pygame.MOUSEBUTTONDOWN:
            if self.back_rect.collidepoint(event.pos):
                self.app.change_screen("menu")

    def update(self, dt):
        pass

    def draw_background(self, surface):
        """Override per level. Default is a flat fill."""
        surface.fill((20, 20, 24))

    def draw(self, surface):
        self.draw_background(surface)
        self._draw_overlay(surface)
        self._draw_back_button(surface)

    def _draw_overlay(self, surface):
        title = self.title_font.render(self.theme["name"], True, WHITE)
        surface.blit(title, (SCREEN_WIDTH // 2 - title.get_width() // 2, 70))

        badge = pygame.Surface((260, 50), pygame.SRCALPHA)
        pygame.draw.rect(badge, (0, 0, 0, 140), badge.get_rect(), border_radius=10)
        surface.blit(badge, (SCREEN_WIDTH // 2 - 130, 130))

        status = self.status_font.render("Coming Soon", True, self.theme["accent"])
        surface.blit(status, (SCREEN_WIDTH // 2 - status.get_width() // 2, 142))

        hint_text = "Gameplay + motion tracking land here next   -   ESC to go back"
        hint = self.hint_font.render(hint_text, True, (235, 235, 235))
        hint_bg = pygame.Surface((hint.get_width() + 20, hint.get_height() + 10), pygame.SRCALPHA)
        pygame.draw.rect(hint_bg, (0, 0, 0, 120), hint_bg.get_rect(), border_radius=8)
        bg_x = SCREEN_WIDTH // 2 - hint_bg.get_width() // 2
        bg_y = SCREEN_HEIGHT - 56
        surface.blit(hint_bg, (bg_x, bg_y))
        surface.blit(hint, (bg_x + 10, bg_y + 5))

    def _draw_back_button(self, surface):
        pygame.draw.rect(surface, (0, 0, 0, 90), self.back_rect, border_radius=8)
        pygame.draw.rect(surface, WHITE, self.back_rect, 2, border_radius=8)
        label = self.hint_font.render("< Menu", True, WHITE)
        surface.blit(
            label,
            (
                self.back_rect.centerx - label.get_width() // 2,
                self.back_rect.centery - label.get_height() // 2,
            ),
        )
