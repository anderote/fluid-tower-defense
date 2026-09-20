# Animated shambler prototype

Run the feature/dev worktree with `npm run dev`, then open `/tests/shamblers/`.
The normal game also uses the new art for shamblers; other enemy kinds retain
their existing visuals. No particle layout or physics behavior is changed.

- Eight directions: inspect walk, idle, knockback and death. Pause and use
  **Step 100 ms** to inspect collapse frames. Reset restarts the sequence.
- Crowd: 1,600 particles run the actual navigation/pressure solver through a
  choke. **Blast crowd** applies a physical impulse. Toggle pressure colors.
- Stress: 65,536 stationary sprites exercise rendering, not fluid simulation.
  The displayed FPS is presentation throughput, not a GPU timing measurement.

The page runs the production animation compute shader against readback checks
for movement, pause, stationary gait, knockback facing, death, slot reuse and
reset. Each step also verifies that physics particle bytes remain unchanged.
GPU errors appear in the page status. The expandable atlas shows the original
procedural pixel artwork at nearest-neighbor scale.

Animation state lives in a separate GPU buffer. Sprite cutouts are depth-tested
by their feet for crowd overlap; terrain/tower layering follows the existing
renderer. Death frames currently follow the simulation slot, so immediate slot
reuse can shorten a collapse. Persistent corpse snapshots and character sprites
for the remaining enemy types are outside this first prototype.
