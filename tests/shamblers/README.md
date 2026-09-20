# Animated zombie prototypes

Run the feature/dev worktree with `npm run dev`, then open `/tests/zombie-roster/`
for the four-type lineup, directional galleries and mixed-crowd tests.
`/tests/shamblers/` retains the original shambler gallery. The normal game uses
the new art for shamblers, runners, bloaters (the saved `softbody` kind), and
brutes. Ragers and husks retain their existing visuals. Physical stats and the
particle layout are unchanged.

- Eight directions: inspect walk, idle, knockback and death. Pause and use
  **Step 100 ms** to inspect collapse frames. Reset restarts the sequence.
- Lineup: compare the four bodies at the same world scale, facing east and south.
- Crowd: 1,600 mixed particles run the actual navigation/pressure solver through a
  choke. **Blast crowd** applies a physical impulse. Toggle pressure colors.
- Stress: 65,536 stationary sprites exercise rendering, not fluid simulation.
  The displayed FPS is presentation throughput, not a GPU timing measurement.

The page runs 64 production animation compute shader readback checks
for movement, pause, stationary gait, knockback facing, death, slot reuse and
reset. Each step also verifies that physics particle bytes remain unchanged.
Every one of the 512 sprite frames is also checked for clipping and opaque
cutout pixels. GPU errors appear in the page status. The expandable atlas shows the original
procedural pixel artwork at nearest-neighbor scale.

Animation state lives in a separate GPU buffer. Sprite cutouts are depth-tested
by their feet for crowd overlap; terrain/tower layering follows the existing
renderer. Death frames currently follow the simulation slot, so immediate slot
reuse can shorten a collapse. Persistent corpse snapshots and character sprites
for ragers and husks remain future work. The enlarged atlas tiles preserve the
shambler's scale and foot pivot while allowing long limbs and falling bodies.
