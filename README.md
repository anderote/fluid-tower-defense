# Pressure Front

A browser tower-defense prototype with a GPU-simulated compressible zombie crowd. Local WebGPU handles crowd physics, targeting, damage, and rendering.

Crowd pressure now directly hurts zombies: damage begins at sustained moderate pressure, ramps smoothly with compression, and reaches the full crush rate at the crush-pressure level. Enemy crush tolerance and brittle status still modify the final damage taken.

## Run locally

```sh
npm install
npm run dev
```

Open the localhost URL printed by Vite in a browser with WebGPU enabled (a current Chrome or Safari). No API keys or server-side GPU are needed.

## Play

- **Level Editor:** paint or drag walls, use Erase (or right-drag), save/load a local level, then **Apply & Play** to start a fresh defense. Walls may enter the spawn area and former central lane as long as a route to the goal remains. Cancel preserves the current run.
- **View:** Fullscreen fills the display; Hide UI expands the arena. Show UI brings controls back.
- **Lab:** starts with 10,000 zombies. Click to blast, select Push to shove toward the base, or toggle the actual pressure heatmap. Reset restores the swarm. Large population requests are capped by the non-overlapping spawn area and the actual count is displayed.
- **Game:** select a tower and click any clear ground, including the shaded spawn zone. Walls still cannot hold towers. Select the same build button again or press Escape to leave placement mode. Click a deployed tower to inspect, upgrade, or sell it. Start the wave when ready.
- Weapon unlocks and all stat research cost **Metal** and belong to the current run. Unlocking a weapon enables its normal placement purchase; resetting the run clears its unlocks and research. Autosave retains them between sessions. Old saves retain deployed weapons and Metal; account-wide Command XP no longer grants purchases or bonuses.
- Kill bounties use the 100× reduction: 100 accumulated bounty points pay 1 Metal (for example, 34 shamblers pay the first Metal). Repulsors have range 10, force 16, a 1.35-second pulse interval, and slower range growth from upgrades.
- Eight towers and six enemy roles: shambler, runner, brute, rager, softbody, and husk. Hordes walk in through a physical approach west of the map. Wave number and **Horde Intensity** increase packing, with shifting dense patches and gaps; **Stream Width** controls frontage only, independently of wave size. Entry pauses when the approach backs up. Boss pressure arrives every ten waves.
- Wave 10 unlocks extraction. Finish the level, or retain the entire defense and its Metal research and continue through endlessly escalating waves. Every cleared wave after 10 offers that choice again.
- Space pauses/resumes; H toggles the pressure overlay. Restart clears the current attackers and begins the same wave again while keeping defenses in place. Save/load operates between waves in this browser. Switching modes or resetting starts a fresh run; it does not overwrite a saved defense.
- **Red Alert soundtrack:** the top-bar player includes the bundled 22-track Red Alert score in album order. It remembers the current track, timestamp, volume, and play state. Browser autoplay rules require one click or key press to start or resume music.

This is an early playable prototype with simple geometric art and initial balancing. Endless difficulty grows through composition, tempo, and enemy health while raw live population remains bounded. Towers are nonblocking emplacements; terrain is static during combat. Mortar damage resolves on a firing tick, with visual impact cues. Full rigid-body corpses, arbitrary tower scripting, destructible terrain, and native packaging are not implemented.

## Validate

```sh
npm test
npm run build
npm run test:e2e
```

`test:e2e` opens a repeatable browser suite at `/tests/e2e/` on dedicated port 5180. Click **Run checks** in a WebGPU browser. It drives the actual game through checkpoint/restore, terrain removal/reset, wall-mounted placement, and research purchases. Existing saves on that origin are restored after the run. If a reload or interruption stops the suite, reopening the test page recovers the original saves before another run. These are browser-native DOM-event tests with a real GPU, not headless CI or screenshot comparisons.

Open `http://127.0.0.1:5173/?validate=1` while the dev server runs for real GPU compute/readback checks. Seven checks cover compression, impulses, slowing, exactly-once rewards, base arrivals, boss targeting/damage, and boss phase transitions. Developer diagnostics in the game show tick count, live population, invalid values, frame timings, and GPU readback errors. Display FPS is distinct from the fixed 60Hz simulation rate.

The focused Metal economy suite is at `/tests/economy/` on the local server. **Run checks** verifies actual UI unlock/stat purchases, affordability, autosave/reload/reset, reduced GPU bounties, and Repulsor range/impulse. It backs up and restores that origin’s game saves.

## Architecture and planning

- [Technical research](RESEARCH.md)
- [Gameplay architecture](GAMEPLAY_ARCHITECTURE.md)
- [Content direction](CONTENT_DESIGN.md)
- [Parallel development plan](PARALLEL_DEVELOPMENT_PLAN.md)
- [Implementation ledger](TASKS.md)
- [Benchmark procedure](benchmarks/README.md)

The planning documents include future content. See the implementation and validation results for current capabilities.

The turret art gallery at `/tests/soldat-art/` compares each weapon at base level and upgrade levels 1, 10, 25, and 50, in enlarged and game-scale views. It checks all 2,560 frames for clipping and visible upgrade changes in every direction. `/tests/soldat-art/scene.html` displays the same lineup with the production WebGPU renderer and lets you rotate or upgrade it live.

The focused horde GPU suite at `/tests/horde/` checks offscreen movement, continuous boundary crossing, repeated dead-slot recycling, live-slot protection, and congestion feedback.

The Tesla effects lab at `/tests/tesla/` exercises the actual GPU chain, damage falloff, Storm Cell extension, range gaps, kill attribution, recycled slots, and reset. Its playback selector freezes the strike, skeleton, collapse, and ash stages. Tesla hits up to four distinct enemies (six with Storm Cell); each jump uses the coil's upgraded radius and loses power. Impact blasts are visual sparks and smoke, without additional splash damage.

Tesla electrocution uses the original Red Alert `electro.tem` artwork with the temperate palette, imported by `npm run assets:red-alert`. Timing follows [OpenRA's infantry die6 sequence](https://github.com/OpenRA/OpenRA/blob/bleed/mods/ra/sequences/infantry.yaml): 80 ms frames, three repeats of the initial four frames, then collapse. The new GPU bolt renderer follows the bright-core/two-dim-strand appearance of [OpenRA's TeslaZap](https://github.com/OpenRA/OpenRA/blob/bleed/OpenRA.Mods.Cnc/Projectiles/TeslaZap.cs); its implementation is original. Original Red Alert artwork remains © Electronic Arts; see the atlas source metadata and [OpenRA's legal notice](https://www.openra.net/legal/).

Opening wave: 1,200 enemies, with later waves adding 600 up to a 12,000-enemy cap. The opening targets roughly 60–90 seconds with a working defense at default frontage; narrow entrances, blocked approaches, and weak defenses can take longer. Wave progress shows both enemies on the field and those still queued.

Run `/tests/wave-pacing/` on a dedicated development port for the full opening-wave browser regression: it checks stream-width independence, live/queued counts, a real WebGPU clear with a 2,990-Metal defense, and the transition to wave two. It backs up and restores saves on that origin.
