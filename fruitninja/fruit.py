"""A single tossed fruit: simple projectile physics + drawing."""

import math
import random

import pygame

from .settings import FRUITS, FRUIT_RADIUS, GRAVITY


class Fruit:
    """One fruit arcing across the screen under gravity.

    Coordinates are floats so motion stays smooth regardless of frame rate.
    A fruit is "sliced" once and then plays out the rest of its arc; callers
    check `sliced` for scoring and `is_off_bottom()` for misses.
    """

    def __init__(self, x, vx, vy, screen_height, rng=None):
        rng = rng or random
        self.x = float(x)
        self.y = float(screen_height + FRUIT_RADIUS)
        self.vx = float(vx)
        self.vy = float(vy)
        self.radius = FRUIT_RADIUS
        self.screen_height = screen_height

        self.name, self.color, self.highlight = rng.choice(FRUITS)
        self.angle = 0.0
        self.spin = rng.uniform(-3.0, 3.0)
        self.sliced = False

    def update(self, dt):
        self.vy += GRAVITY * dt
        self.x += self.vx * dt
        self.y += self.vy * dt
        self.angle += self.spin * dt

    def contains(self, point):
        px, py = point
        return math.hypot(px - self.x, py - self.y) <= self.radius

    def is_off_bottom(self):
        """True once the fruit has fallen fully below the screen."""
        return self.y - self.radius > self.screen_height

    def draw(self, surface):
        center = (int(self.x), int(self.y))
        pygame.draw.circle(surface, self.color, center, self.radius)
        # Offset highlight gives the fruit a bit of roundness.
        hl_offset = int(self.radius * 0.35)
        hx = int(self.x - hl_offset * math.cos(self.angle))
        hy = int(self.y - hl_offset * math.sin(self.angle))
        pygame.draw.circle(surface, self.highlight, (hx, hy), max(4, self.radius // 4))
        if self.sliced:
            pygame.draw.line(
                surface,
                (255, 255, 255),
                (int(self.x - self.radius), int(self.y)),
                (int(self.x + self.radius), int(self.y)),
                3,
            )
