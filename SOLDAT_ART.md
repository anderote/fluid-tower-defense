# Soldat-inspired turret study

All eight defenses now have original overhead sprites based on compact military
hardware: olive housings, dark receivers and barrels, ammo belts, pipework,
ceramic insulators and small worn metal highlights. The reference is Soldat's
weapon detail and subdued material palette, adapted to this game's overhead
camera. No Soldat images, models, or game code are copied.

Reference: https://www.soldat.pl/en/screenshots/ (weapon menu and gameplay).

The art is authored as small extruded shapes in `src/render/soldat-art.ts` and
baked once at initialization into 64 directional frames per weapon. Each frame
has a fixed foundation, a consistent world pivot and stationary lighting. The
Tesla Coil is stationary; its 64 slots intentionally show the same structure.
The generated atlas is reused throughout play, with no per-frame canvas drawing.

This pass covers turrets only. The original Red Alert floors and walls remain,
and their provenance and rights are still described in `RED_ALERT_ASSETS.md`.
Gameplay, construction costs, footprints, targeting, and weapon effects retain
their existing behavior. New recoil and firing-animation frames are not part of
this study. This is a style adaptation, not an exact recreation of Soldat's
side-view rendering.

## Review

- `/`: play with the new turret art.
- `/?turretArt=red-alert`: compare the previous Red Alert turret pass.
- `/tests/soldat-art/`: all eight designs, stepped/animated rotation, and an
  automated border check for all 512 frames.
- `/tests/art/scene.html`: the prior original Red Alert reference room.

Custom sprites and Red Alert sprites share the existing GPU texture pipeline.
The custom atlas occupies the lower half of a 2048-square runtime texture;
the original source image is retained in the upper-left. Missing facility assets
continue to fall back to the earlier geometry renderer.
