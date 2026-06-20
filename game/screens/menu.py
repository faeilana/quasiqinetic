"""Level-select menu: 3 cards for Train Station, Woods, and Mountain."""

import pygame

from ..settings import (
    ACCENT,
    MOUNTAIN_THEME,
    SCREEN_HEIGHT,
    SCREEN_WIDTH,
    TRAIN_STATION_THEME,
    WARM_BG_BOTTOM,
    WARM_BG_TOP,
    WARM_TEXT_DARK,
    WARM_TEXT_MUTED,
    WARM_TITLE,
    WHITE,
    WOODS_THEME,
)
from .base import BaseScreen


class MenuOption:
    def __init__(self, key, label, theme, rect):
        self.key = key
        self.label = label
        self.theme = theme
        self.rect = rect


class MenuScreen(BaseScreen):
    def __init__(self, app):
        super().__init__(app)
        self.heading_font = pygame.font.SysFont("arialrounded", 36, bold=True)
        self.label_font = pygame.font.SysFont("trebuchetms", 24, bold=True)
        self.hint_font = pygame.font.SysFont("trebuchetms", 16)
        self.selected = 0
        self.options = self._build_options()

    def _build_options(self):
        card_w, card_h = 240, 320
        gap = 50
        total_w = card_w * 3 + gap * 2
        start_x = (SCREEN_WIDTH - total_w) // 2
        y = 200

        themes = [
            ("train_station", "Train Station", TRAIN_STATION_THEME),
            ("woods", "The Woods", WOODS_THEME),
            ("mountain", "The Mountain", MOUNTAIN_THEME),
        ]

        options = []
        for i, (key, label, theme) in enumerate(themes):
            rect = pygame.Rect(start_x + i * (card_w + gap), y, card_w, card_h)
            options.append(MenuOption(key, label, theme, rect))
        return options

    def on_enter(self):
        pass

    def handle_event(self, event):
        if event.type == pygame.KEYDOWN:
            self._handle_key(event.key)
        elif event.type == pygame.MOUSEMOTION:
            self._handle_hover(event.pos)
        elif event.type == pygame.MOUSEBUTTONDOWN:
            self._handle_click(event.pos)

    def _handle_key(self, key):
        if key in (pygame.K_LEFT, pygame.K_a):
            self.selected = (self.selected - 1) % len(self.options)
        elif key in (pygame.K_RIGHT, pygame.K_d):
            self.selected = (self.selected + 1) % len(self.options)
        elif key in (pygame.K_RETURN, pygame.K_SPACE):
            self._launch(self.options[self.selected])
        elif key == pygame.K_ESCAPE:
            self.app.change_screen("landing")

    def _handle_hover(self, pos):
        for i, option in enumerate(self.options):
            if option.rect.collidepoint(pos):
                self.selected = i

    def _handle_click(self, pos):
        for option in self.options:
            if option.rect.collidepoint(pos):
                self._launch(option)

    def _launch(self, option):
        self.app.change_screen(option.key)

    def update(self, dt):
        pass

    def draw(self, surface):
        self._draw_background(surface)

        heading = self.heading_font.render("Choose Your Run", True, WARM_TITLE)
        surface.blit(heading, (SCREEN_WIDTH // 2 - heading.get_width() // 2, 110))

        for i, option in enumerate(self.options):
            self._draw_card(surface, option, is_selected=(i == self.selected))

        hint = self.hint_font.render(
            "<- -> or hover to choose   ENTER / click to play   ESC to go back",
            True,
            WARM_TEXT_MUTED,
        )
        surface.blit(hint, (SCREEN_WIDTH // 2 - hint.get_width() // 2, SCREEN_HEIGHT - 60))

    def _draw_background(self, surface):
        for y in range(0, SCREEN_HEIGHT, 2):
            ratio = y / SCREEN_HEIGHT
            color = tuple(
                int(WARM_BG_TOP[i] + (WARM_BG_BOTTOM[i] - WARM_BG_TOP[i]) * ratio)
                for i in range(3)
            )
            pygame.draw.line(surface, color, (0, y), (SCREEN_WIDTH, y))
            pygame.draw.line(surface, color, (0, y + 1), (SCREEN_WIDTH, y + 1))

    def _draw_card(self, surface, option, is_selected):
        theme = option.theme
        rect = option.rect

        card_surf = pygame.Surface(rect.size)
        top, bottom = theme["sky_top"], theme["sky_bottom"]
        for y in range(rect.height):
            ratio = y / rect.height
            color = tuple(int(top[i] + (bottom[i] - top[i]) * ratio) for i in range(3))
            pygame.draw.line(card_surf, color, (0, y), (rect.width, y))
        surface.blit(card_surf, rect.topleft)

        border_color = ACCENT if is_selected else (70, 74, 84)
        border_width = 4 if is_selected else 2
        pygame.draw.rect(surface, border_color, rect, border_width, border_radius=10)

        if is_selected:
            lift = pygame.Rect(rect.x - 6, rect.y - 6, rect.width + 12, rect.height + 12)
            pygame.draw.rect(surface, ACCENT, lift, 2, border_radius=14)

        label_bg = pygame.Surface((rect.width, 50), pygame.SRCALPHA)
        pygame.draw.rect(label_bg, (0, 0, 0, 140), label_bg.get_rect())
        surface.blit(label_bg, (rect.x, rect.bottom - 50))

        label = self.label_font.render(option.label, True, WHITE)
        surface.blit(label, (rect.centerx - label.get_width() // 2, rect.bottom - 40))
