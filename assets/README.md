# Assets

Empty for now - every background, icon, and shape in the shell is drawn
procedurally with pygame primitives (no image files required), so the
project runs with zero binary assets.

Drop real art here when you have it, for example:

```
assets/
  images/
    player_sprite.png
    train_station_bg.png
  fonts/
    your_game_font.ttf
```

Then load images with `pygame.image.load("assets/images/...")` and
fonts with `pygame.font.Font("assets/fonts/...", size)` in place of the
procedural drawing / `pygame.font.SysFont` calls used today.
