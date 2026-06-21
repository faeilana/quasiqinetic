"""Fruit Ninja screen: spawns fruit, tracks slices, score and misses.

Built on the same `BaseScreen` interface as the runner levels so it can be
registered in `game/app.py` and reached from the menu (see README.md).

Input today is the mouse pointer as a stand-in for a slicing motion. Once
`tracking/pose_tracker.py` emits a hand position, feed that point into
`slice_at()` instead of the mouse and the rest works unchanged.
"""

import random

import pygame

from game.fonts import baloo2, luckiest_guy
from game.screens.base import BaseScreen
from game.settings import SCREEN_HEIGHT, SCREEN_WIDTH, WHITE

from .fruit import Fruit
from .settings import (
    FRUIT_NINJA_THEME,
    MAX_LAUNCH_SPEED,
    MAX_MISSES,
    MIN_LAUNCH_SPEED,
    SPAWN_INTERVAL,
)


class FruitNinjaScreen(BaseScreen):
    theme = FRUIT_NINJA_THEME

    def __init__(self, app):
        super().__init__(app)
        self.title_font = luckiest_guy(34)
        self.hud_font = baloo2(22, bold=True)
        self.hint_font = baloo2(14)
        self.back_rect = pygame.Rect(24, 24, 110, 40)
        self.rng = random.Random()
        self.reset()

    def reset(self):
        self.fruits = []
        self.score = 0
        self.misses = 0
        self.spawn_timer = 0.0
        self.game_over = False

    def on_enter(self):
        self.reset()

    # -- input --------------------------------------------------------------
    def handle_event(self, event):
        if event.type == pygame.KEYDOWN and event.key == pygame.K_ESCAPE:
            self.app.change_screen("menu")
        elif event.type == pygame.MOUSEBUTTONDOWN:
            if self.back_rect.collidepoint(event.pos):
                self.app.change_screen("menu")
            elif self.game_over:
                self.reset()
            else:
                self.slice_at(event.pos)
        elif event.type == pygame.MOUSEMOTION and event.buttons[0] and not self.game_over:
            self.slice_at(event.pos)

    def slice_at(self, point):
        """Slice any (unsliced) fruit under `point`. +1 score per fruit."""
        for fruit in self.fruits:
            if not fruit.sliced and fruit.contains(point):
                fruit.sliced = True
                self.score += 1

    # -- update -------------------------------------------------------------
    def update(self, dt):
        if self.game_over:
            return

        self.spawn_timer += dt
        if self.spawn_timer >= SPAWN_INTERVAL:
            self.spawn_timer -= SPAWN_INTERVAL
            self._spawn_fruit()

        for fruit in self.fruits:
            fruit.update(dt)

        remaining = []
        for fruit in self.fruits:
            if fruit.is_off_bottom():
                if not fruit.sliced:
                    self.misses += 1
            else:
                remaining.append(fruit)
        self.fruits = remaining

        if self.misses >= MAX_MISSES:
            self.game_over = True

    def _spawn_fruit(self):
        x = self.rng.randint(120, SCREEN_WIDTH - 120)
        vx = self.rng.uniform(-120, 120)
        vy = -self.rng.uniform(MIN_LAUNCH_SPEED, MAX_LAUNCH_SPEED)
        self.fruits.append(Fruit(x, vx, vy, SCREEN_HEIGHT, rng=self.rng))

    # -- draw ---------------------------------------------------------------
    def draw(self, surface):
        self._draw_sky(surface)
        for fruit in self.fruits:
            fruit.draw(surface)
        self._draw_hud(surface)
        self._draw_back_button(surface)
        if self.game_over:
            self._draw_game_over(surface)

    def _draw_sky(self, surface):
        top, bottom = self.theme["sky_top"], self.theme["sky_bottom"]
        for y in range(SCREEN_HEIGHT):
            ratio = y / SCREEN_HEIGHT
            color = tuple(int(top[i] + (bottom[i] - top[i]) * ratio) for i in range(3))
            pygame.draw.line(surface, color, (0, y), (SCREEN_WIDTH, y))

    def _draw_hud(self, surface):
        title = self.title_font.render(self.theme["name"], True, WHITE)
        surface.blit(title, (SCREEN_WIDTH // 2 - title.get_width() // 2, 24))

        score = self.hud_font.render(f"Score: {self.score}", True, WHITE)
        surface.blit(score, (SCREEN_WIDTH - score.get_width() - 24, 28))

        misses_left = MAX_MISSES - self.misses
        misses = self.hud_font.render(f"Lives: {misses_left}", True, self.theme["accent"])
        surface.blit(misses, (SCREEN_WIDTH - misses.get_width() - 24, 58))

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

    def _draw_game_over(self, surface):
        veil = pygame.Surface((SCREEN_WIDTH, SCREEN_HEIGHT), pygame.SRCALPHA)
        veil.fill((0, 0, 0, 170))
        surface.blit(veil, (0, 0))

        over = self.title_font.render("Game Over", True, WHITE)
        surface.blit(over, (SCREEN_WIDTH // 2 - over.get_width() // 2, SCREEN_HEIGHT // 2 - 60))

        final = self.hud_font.render(f"Final score: {self.score}", True, self.theme["accent"])
        surface.blit(final, (SCREEN_WIDTH // 2 - final.get_width() // 2, SCREEN_HEIGHT // 2))

        hint = self.hint_font.render("Click to play again   -   ESC for menu", True, WHITE)
        surface.blit(hint, (SCREEN_WIDTH // 2 - hint.get_width() // 2, SCREEN_HEIGHT // 2 + 40))
