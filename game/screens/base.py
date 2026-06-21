"""Common interface every screen implements."""


class BaseScreen:
    """A single screen in the app (landing, menu, or a level).

    Subclasses override whichever hooks they need:
      - on_enter():        called once each time the screen becomes active
      - handle_event(e):   called once per pygame event
      - update(dt):        called once per frame, dt is seconds elapsed
      - draw(surface):     called once per frame to render
    """

    def __init__(self, app):
        self.app = app

    def on_enter(self):
        pass

    def handle_event(self, event):
        pass

    def update(self, dt):
        pass

    def draw(self, surface):
        pass
