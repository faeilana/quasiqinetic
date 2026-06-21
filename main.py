"""
Entry point for Motion Runner.

Run it with:
    python main.py

Or in VS Code: open this folder, select a Python interpreter, then press
F5 (uses the "Run Motion Runner" launch configuration in .vscode/launch.json).
"""

import sys

import pygame

from game.app import App


def main():
    pygame.init()
    app = App()
    app.run()
    pygame.quit()
    sys.exit()


if __name__ == "__main__":
    main()
