# Mass infantry and attack dogs

Infantry Command builds cheap facilities that recruit continuously during combat.
There is no per-building squad cap, global troop cap, or building-count cap.
Recruits cost no additional metal; blocked exits retain the completed recruit.

| Facility | Metal | Seconds per recruit |
| --- | ---: | ---: |
| Rifle Barracks | 120 | 1 |
| Rocket Academy | 200 | 2 |
| Flame Depot | 160 | 1.5 |
| Samurai Dojo | 240 | 2.5 |
| Dog Kennel | 60 | 0.75 |

Each facility has a rally flag and five levels of production, weapons, and armor.
Production multiplies the interval by 0.82 per level. Weapons train new recruits;
armor also equips existing troops. Selling refunds half the actual investment.
Old saves retain their original purchase prices, upgrade spending, and refunds.

Riflemen, rocket troops, flamethrowers, dogs, and kennels use the original Red
Alert sprites distributed for OpenRA. Rifle barracks use the original Allied
tent. Eight-direction standing, running, shooting, dog lunging, and dying
sequences retain their original palette and transparent margins. Samurai remain
the game's original melee unit and artwork. See RED_ALERT_ASSETS.md for provenance.

Troops follow obstacle-aware rally fields and separate into crowds using local
spatial buckets. Melee units pursue nearby zombies; ranged troops make a firing
line and retreat from contact. Dogs run twice as fast as riflemen, bite one live
target at close range, and have only 25 base health.

The GPU uses linked spatial buckets for both armies instead of scanning every
enemy for every soldier. Unit buffers grow with the army; every living unit is
uploaded. Zombie packing pressure pushes and damages infantry, and living
infantry resist penetration by pushing back on zombie velocity. Target handles,
weapon ranges, and walls are checked again when damage resolves. Research range
bonuses apply equally to CPU decisions and GPU targeting.

Buildings and troops round-trip through between-wave saves without the former
8/64/128-count validation restrictions. Existing kind-less rifle saves remain
valid. Level relocation refunds the full actual facility investment and clears
troops. Ordinary troops target the zombie swarm, not the separate boss body.

The header shows total enemy kills, friendly casualties, and friendly-fire deaths.
Casualties accumulate across waves in the current level and are saved with the
infantry state; restarting the level resets them. Corpses count only once, and
selling or relocating facilities does not register troop deaths. Friendly fire
is a subset of casualties, never a renamed enemy pressure-death count. Existing
allied weapon protection is unchanged, so that subset remains zero during normal
play until collateral damage is enabled.

Validation:
- `npm test` and `npm run build`.
- `/tests/infantry/`: GPU attacks, walls, stale handles, settlement, dogs,
  2,048-unit buffer growth and targeting, and two-way pressure interaction.
- `/tests/infantry/controller.html`: rally UI, upgrades, nine kennels, and saves.
- `/tests/infantry/scene.html`: original directional animation and rendering
  stress test; add 1,000 troops per click.
