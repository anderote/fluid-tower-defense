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

## Camera projection and inspector anchoring

Corrected the CPU world-to-screen projection to match the GPU camera and inverse pointer mapping. The tower inspector now anchors to the selected tower, including letterboxed arenas, zoom, and pan. Added projection round-trip tests and an E2E assertion for inspector position and arena bounds.

Validation: 53 CPU tests, production build, and 6/6 browser E2E scenarios passed on Apple WebGPU.

## Stable research controls

Kept unchanged research, Command XP, boon, and wave-preview markup intact across telemetry updates. Research buttons retain keyboard focus rather than being replaced every refresh, while purchases and combat still update their availability.

Validation: the new browser focus check failed before the fix; 53 CPU tests, production build, and all 7 browser E2E scenarios pass after it.

## Command profile recovery

Validate saved Command XP, upgrade ranks, and unlocked tiers before using them. Known ranks recover as bounded integers; unknown or malformed values cannot create invalid arrays or poison gameplay. Valid progress survives recovery and subsequent purchases persist normally.

Validation: malformed-profile unit test reproduced the issue; 55 CPU tests, production build, and 8/8 browser E2E scenarios passed, including damaged-profile startup, purchase, and reload.

## Keyboard control handling

Let focused buttons handle Space, preserve browser modifier shortcuts and text editing, suppress repeated toggle actions from held keys, and clear camera movement on blur, hidden tabs, or text-input focus.

Validation: 55 CPU tests, production build, and 9/9 browser E2E scenarios passed. The keyboard case covers button Space, modifier shortcuts, held build keys, and Escape cancellation.

## Interrupted E2E recovery

Persist original saves before browser tests change them, recover interrupted runs on the next visit, and retain backups when restoration fails. Frame navigation now has a timeout. The suite refuses to overwrite a pending backup.

Validation: 57 CPU tests, production build, and 9/9 browser E2E checks passed. A deliberate reload during a run displayed successful original-save recovery before the next full run.

## Stationary placement preview performance

Cache the last wall-placement validation by geometry, pointer cell, and tower positions. Unchanged previews avoid rebuilding the navigation field; terrain edits, goal/spawn changes, and tower placement still invalidate the result. Actual construction always validates afresh.

Validation: 58 CPU tests, production build, and 9/9 browser scenarios passed. A local 120-preview microbenchmark measured 201.25 ms without caching and 1.68 ms with caching; this measures validation cost, not whole-game FPS.

## Tower checkpoint validation

Reject malformed kills, veterancy ranks, and experience before applying a checkpoint. Failed loads preserve the current defense; older saves without optional combat-record fields remain supported.

Validation: a new CPU test reproduced invalid-record acceptance before the fix. All 59 CPU tests, production build, and 10/10 browser E2E cases passed, including rejection through the actual Load button without changing Metal or deployed towers.
## Run Metal economy and Repulsor balance

Weapon unlocks and repeatable stat research now spend Metal and are owned by the run. Saves retain purchases; reset clears them. Legacy saves retain deployed weapon types and Metal without applying account-wide XP bonuses. Retained the concurrently integrated 100× enemy-bounty reduction, including fractional reward accumulation. Repulsors have range 10, force 16, 1.35-second pulses, a narrower cone, weaker branch bonuses, and reduced per-level range growth.

Validation: unit tests and production build passed; the focused `/tests/economy/` browser suite passed 4/4 scenarios covering unlock/place/reload/reset, stat affordability and combat purchases, exactly-once GPU bounties, and actual Repulsor range/impulse.

## Playable opening waves and visible progress

Decoupled stream width from wave quotas: wave one now has 1,200 enemies instead of six million at default frontage. Later waves add 600 enemies up to a 12,000 cap. Added an always-visible sidebar forecast/remaining count, split into live and queued enemies, and included progress in diagnostics.

Full-wave playtesting also exposed stranded survivors: navigation treated zombies as points while collision reserved body radius. Routes now reserve body clearance and guide displaced bodies out of wall margins instead of directing them through terrain.

Validation: 133 CPU tests and production build passed. The final browser regression cleared Pine Valley wave one in 70.9 simulated seconds with 1,200 kills, 100% integrity, and a 2,990-Metal defense; the counter reached zero and wave two became available. It also checked widths 1, 60, and 100 produce the same quota. Earlier runs reproduced stranded survivors before the navigation fix. Later campaign difficulty and arbitrary player defenses have not been fully balanced.

## First-five-wave pacing and earned progression

Reduced the first heavy-wave quotas to 1,700 / 1,800 and their brute shares to 12% each. Earlier physical inlet checks showed 95 / 108 seconds just to spawn the old waves 4–5; early browser runs also exposed a sharp armored-survivor difficulty spike. These introductions now trade population for toughness without changing later cycles' authored composition. Preparation shows enemy counts, clear rewards, and a counter hint.

Expanded `/tests/wave-pacing/` to five actual WebGPU waves with a 2,990-Metal starting defense. It buys damage/fire-rate ranks from earnings, builds two rear autocannons through the UI before wave three, buys a forge before wave four, and checks the visible wave-three boon gate. It records engagement, arrival, total-wave and stall timing, kills, integrity, and Metal. A replay button restores the actual earned wave-three checkpoint for targeted heavy-wave iteration; it never substitutes synthetic kills or free currency. Original game saves are restored afterward.

Validation: 135 CPU tests and production build passed. The final unchanged waves 1–3 cleared consecutively in 73.3 / 81.6 / 90.2 simulated seconds, with full integrity. After the final quota adjustment, waves 4–5 passed from that earned checkpoint in 125.1 / 128.5 seconds, also at full integrity. Their arrivals finished at 54.2 / 55.3 seconds and their longest progress lulls were 1.5 / 2.0 seconds. No invalid-particle or GPU readback errors occurred. Earlier attempts without added rear coverage sometimes lost wave three or four; one heavier candidate cleared but exceeded the timing budget. These checks cover one viable Pine Valley build and upgrade path, not every layout or later campaign balance.

## Crusher Gate and Tesla Overload

Added a 450-Metal manual Crusher Gate with an open horizontal passage, animated hydraulic jaws, sparks, impact audio, recharge gauge, and Heavy Pistons / Rapid Hydraulics branches. Shortcut 9 selects it; G or the sidebar button slams every ready gate. Damage scales with crowd packing and enemy crush resistance. Navigation uses the two fixed jaw bases, placement reserves the passage, and kills pay salvage and tower veterancy. Cooldowns follow simulation time and pause correctly.

Added 450-Metal Tesla Overload research: every sixth actual discharge hits up to twelve targets with triple initial damage and gentler falloff, thicker violet lightning, charge lights, and a burst of sparks. Normal and Storm Cell chains retain their original limits. Prior-version saves migrate to include the new equipment without losing run progress.

Validation: 138 CPU tests, production build, 25 focused real-WebGPU checks, and the focused actual-game E2E scenario passed. GPU checks cover overload cadence and damage, rectangle boundaries, dense-crowd bonus, kill attribution (including an already-killed Tesla victim), and rendering. UI checks cover purchase, keyboard placement, save/reload, button and G activation, pause, and recharge. These are focused mechanic tests; later-wave balance and a full campaign with the new equipment remain unmeasured.
