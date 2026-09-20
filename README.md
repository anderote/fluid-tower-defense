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
- **Game:** runs start with 1,200 Metal and access to the Repulsor and Autocannon. The other six towers require expensive permanent Command XP unlocks. Select an available tower and click any clear ground, including the shaded spawn zone. Walls still cannot hold towers. Select the same build button again or press Escape to leave placement mode. Click a deployed tower to inspect, upgrade, or sell it. Start the wave when ready.
- Four towers: repulsor, mortar, autocannon, cryo emitter. Three normal enemy kinds: shambler, runner, brute. Five authored waves, branch upgrades, bonus choices, and the Bulldozer boss on the final wave.
- Space pauses/resumes; H toggles the pressure overlay. Restart clears the current attackers and begins the same wave again while keeping defenses in place. Progress autosaves between waves and restores automatically after reloading. **New Game** permanently clears the current run, defenses, custom level, Command XP, and upgrades.

This is an early playable prototype with simple geometric art and initial balancing. Enemy counts in Game are lower than the large Lab stress tests. Towers are nonblocking emplacements; authored terrain is static, while player-built walls and wire can fail under local crowd pressure. Mortar damage resolves on a firing tick, with visual impact cues. Full rigid-body corpses, arbitrary tower scripting, destructible authored terrain, and native packaging are not implemented.

## Validate

```sh
npm test
npm run build
```

Open `http://127.0.0.1:5173/?validate=1` while the dev server runs for real GPU compute/readback checks. Seven checks cover compression, impulses, slowing, exactly-once rewards, base arrivals, boss targeting/damage, and boss phase transitions. Developer diagnostics in the game show tick count, live population, invalid values, frame timings, and GPU readback errors. Display FPS is distinct from the fixed 60Hz simulation rate.

## Architecture and planning

- [Technical research](RESEARCH.md)
- [Gameplay architecture](GAMEPLAY_ARCHITECTURE.md)
- [Content direction](CONTENT_DESIGN.md)
- [Parallel development plan](PARALLEL_DEVELOPMENT_PLAN.md)
- [Implementation ledger](TASKS.md)
- [Benchmark procedure](benchmarks/README.md)

The planning documents include future content. See the implementation and validation results for current capabilities.
