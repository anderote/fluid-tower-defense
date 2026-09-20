# Implementation ledger

Completed on 2026-09-19 using Sol for physics/bosses, Terra for presentation and gameplay/editor, and lead integration.

| Area | Status |
| --- | --- |
| GPU contracts, fixed clock, asynchronous counters | Complete; real adapter and ABI verified |
| Compressible crowd, pressure damage, spatial neighbors | Complete for prototype |
| GPU targeting, four towers, slowing, firing effects | Complete for prototype |
| Five waves, three enemy kinds, economy, upgrades, bonuses | Implemented; first wave played through |
| Boss phase machine, damage, rewards and leaks | GPU checks passed |
| Level editor, local saves, navigation validation | Integrated and browser smoke-tested |
| Fullscreen and expanded arena controls | Integrated |

Validation: 19 CPU tests, production build, and 7 real-GPU checks passed with zero GPU validation errors. Full five-wave difficulty balancing remains future playtesting.

## Preparation wave preview

Implemented the content plan's pre-wave enemy preview using the same procedural wave definition as gameplay. The preparation card shows composition and roles, a separate boss warning, flow-adjusted peak arrival rate, and completion payout or next-level reset. It remains visible in Build and Research and hides during combat and Lab mode. README play instructions now reflect the eight-tower, ten-wave progression.

Validation: 36 CPU tests and production build pass, including forecast/queue agreement across two complete levels, save restoration, phase visibility, and flow scaling. Chrome/WebGPU smoke checks confirmed preparation rendering, Build/Research visibility, 40× flow updates, and hiding during combat and Lab mode. Boss forecasts and level transitions are covered by CPU tests; a full ten-wave browser playthrough was not performed.

## Combat and research feedback

Added a Bulldozer health/phase HUD driven by existing GPU readback, with bracing/charging/recovery guidance and terminal defeat/breach status. Research prerequisites now live in the content registry, and purchase validation and button availability share one rule with visible lock reasons. The Zombie Flow slider now reflects restored session settings.

Validation: 42 CPU tests, production build, and all 7 real-GPU checks passed on Apple WebGPU with zero validation errors. Browser checks covered boss status layout/transitions using a UI fixture, research prerequisite unlocking after purchase, and a seeded wave-ten game showing live boss health and a restored 7× flow slider. A full campaign balance playthrough was not performed.

## Full-defense checkpoints

Separated explicit Save/Load checkpoints from automatic between-wave resume saves. Both capture the map, baseline spawn area, structures and wire condition, run state, and flow setting. Loads validate the complete snapshot before changing the current defense, reconnect obstacle identities for demolition, and synchronize the level editor. Manual storage failures now report an error instead of claiming success. Existing unversioned full autosaves remain readable.

Validation: 47 CPU tests and production build passed. Tests cover mounted towers, wire collision state, independent save slots, flow restoration, corrupt snapshots, missing saves, blocked storage, and legacy autosaves. Chrome/WebGPU smoke checks verified Save → alter defenses/flow → autosave → Load, reload resume, and demolition of a restored wall.

## Terrain lifecycle and browser regression suite

Fixed invisible barbed-wire collisions after demolition/breach, removed player structures on Reset, snapped wall-mounted tower placement to the mount center, and rejected structure overlaps with terrain/towers. Added a repeatable browser-native E2E page covering actual game input and WebGPU. Baseline tests reproduced the wire/removal and Reset bugs before implementation.

Validation: 50 CPU tests, production build, and 5/5 real-browser E2E scenarios passed on Apple WebGPU.
