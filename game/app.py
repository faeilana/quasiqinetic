"""Owns the window, the screen-state machine, and the main loop."""

import pygame

from .settings import FPS, GAME_TITLE, SCREEN_HEIGHT, SCREEN_WIDTH
from .screens.landing import LandingScreen
from .screens.menu import MenuScreen
from .screens.mountain import MountainScreen
from .screens.train_station import TrainStationScreen
from .screens.woods import WoodsScreen


class App:
    """Top-level controller: creates the window and routes between screens.

    Screens are looked up by string key. To add a fourth level later,
    instantiate it in `self.screens` below and point a menu option at
    its key - no other wiring required.
    """

    def __init__(self):
        # SCALED tells SDL to render at the display's native (e.g. Retina)
        # resolution and scale up, instead of rendering at 1x and letting
        # macOS blur-upscale the window - this is what was causing the
        # grainy/blurry look.
        self.screen = pygame.display.set_mode(
            (SCREEN_WIDTH, SCREEN_HEIGHT), pygame.SCALED
        )
        pygame.display.set_caption(GAME_TITLE)
        self.clock = pygame.time.Clock()
        self.running = True

        self.screens = {
            "landing": LandingScreen(self),
            "menu": MenuScreen(self),
            "train_station": TrainStationScreen(self),
            "woods": WoodsScreen(self),
            "mountain": MountainScreen(self),
        }

        self.current_key = "landing"
        self.current = self.screens[self.current_key]
        self.current.on_enter()

    def change_screen(self, key):
        if key not in self.screens:
            raise KeyError(f"Unknown screen '{key}'")
        self.current_key = key
        self.current = self.screens[key]
        self.current.on_enter()

    def quit(self):
        self.running = False

    def run(self):
        while self.running:
            dt = self.clock.tick(FPS) / 1000.0

            for event in pygame.event.get():
                if event.type == pygame.QUIT:
                    self.quit()
                else:
                    self.current.handle_event(event)

            self.current.update(dt)
            self.current.draw(self.screen)
            pygame.display.flip()
