# First three environments

New games begin in **Pine Valley**, move to **Frostline Outpost** after wave 10,
then to **Containment Works** after wave 20. Continuing past the third map keeps
the facility for endless play. Existing saves keep their original map; New Game
starts the new campaign. This pass does not rebalance the existing wave quotas.

At a map transition, tower construction and upgrades are refunded at their full
recorded cost, placed walls return 60 Metal each, and wire returns 45 each.
Repairs are not refunded separately. Research, unlocks, boons, unspent Metal,
base health, and the global wave count carry over. Deployed towers (including
their individual combat records/veterancy) are removed for rebuilding.

## Level design

1. **Pine Valley / temperate forest.** Dense woodland borders frame open firing
   clearings. A village road meets a ridge gate; a second rocky spine divides
   the later approach. Houses sit behind the forward choke, giving the retreat
   area a civilian-village identity without filling the road with obstacles.
2. **Frostline Outpost / snow.** A staggered central rock mass divides upper and
   lower passes. Snow-covered conifers and a small depot establish the setting.
   Offset eastern ridges give the branches different approach lengths and leave
   a final common defense area before the goal.
3. **Containment Works / interior.** Three industrial bays use offset doorways,
   mountable concrete partitions, service blocks, crate stacks, and drums.
   Grating separates working areas from dark-panel corridors; hazard stripes
   mark door thresholds. Two openings in the final partition provide a bypass.

Cliff cells, building foundations, and trunks are real collision geometry.
Trees/cliffs/buildings cannot be turret mounts; concrete wall cells can. Original
sprite margins are not used as oversized building footprints. Roads and floor
markings are visual aids, not mandatory enemy paths or movement-speed modifiers.
Props are static and indestructible in this pass; no scenery explosion effects
or new damage simulation are implied by the barrel artwork.

The boss uses a cached, radius-inflated navigation field for scenery maps and
enters from the normal western approach. Legacy maps retain their former boss
behavior. `/tests/levels/gpu.html` drives the real boss shaders across all three
maps and checks sampled positions against obstacle clearance.

## Review

- `/tests/levels/`: map chooser, full landscape views, and enemy-route overlay.
- `/?map=1`, `/?map=2`, `/?map=3`: standalone playtests of each environment at
  starting difficulty. These links do not load or automatically overwrite an
  existing autosave. They are map previews, not progression cheats.
- `/tests/levels/assets.html`: original cliff, road, tree, and building parts.
- `/tests/floor-art/`: the earlier dark-panel versus steel-grating comparison.

Route, scenery, mounting, transition/refund, and save tests live in
`src/content/levels.test.ts`. All west-edge inlet cells reach the goal; every
map also has a route with 3.5 world units of obstacle clearance. Full campaign
balance over the very large existing wave quotas has not been playtested.

## Asset provenance

The verified OpenRA `ra-base.zip` importer now reads `temperat.mix` and `snow.mix`
as well as the original interior/common packages. Temperate and snow assets use
their own original palettes; indoor assets keep `interior.pal`. Terrain template
dimensions and rock-cell classifications in `scripts/red-alert-terrain.json`
were checked against OpenRA's original-asset tileset definitions:
https://github.com/OpenRA/OpenRA/blob/bleed/mods/ra/tilesets/temperat.yaml
and https://github.com/OpenRA/OpenRA/blob/bleed/mods/ra/tilesets/snow.yaml .
Artwork rights and the verified package checksum remain documented in
`RED_ALERT_ASSETS.md`. The enlarged source atlas is 2048 square; custom Soldat
sprites are appended beneath it in a 2048 × 3072 runtime texture.
