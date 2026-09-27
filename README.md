# Pressure Front

A browser tower-defense prototype with a GPU-simulated compressible zombie crowd. Local WebGPU handles crowd physics, targeting, damage, and rendering.

Crowd pressure now directly hurts zombies: damage begins at sustained moderate pressure, ramps smoothly with compression, and reaches the full crush rate at the crush-pressure level. Enemy crush tolerance and brittle status still modify the final damage taken.

## Stable local game

Open **http://127.0.0.1:5173**. This is a published build outside Git, running in the background through macOS launchd. Branch changes and development builds do not affect it. It starts again on login and uses the same browser saves as the old server.

Ask Codex: **“update the game server.”** This means validate local `dev`, merge it into local `main`, then publish the server files from committed `main`. The chain is strictly **dev → main → game server**. This is a local release, not a remote Git pull. Ordinary feature work does not publish anything.

The service runs from `~/Library/Application Support/Pressure Front/current`, with immutable builds in `releases/` beside it. The LaunchAgent is `local.pressure-front.game`. Logs are `server.log` and `server-error.log` in that application-support directory. After a release, refresh the game when ready; publishing does not restart the service or reload your tab.

The low-level publish command (after validating and merging dev into main) is:

```sh
~/.local/bin/pressure-front update
```

It builds and tests a clean snapshot of committed main and swaps the release only on success. It never builds the checked-out development files. `pressure-front status`, `start`, and `stop` manage the background service.

One-time setup on another Mac: `node scripts/stable-local.mjs install`, then `~/.local/bin/pressure-front update` and `~/.local/bin/pressure-front start`. Free port 5173 from the old Vite process before starting the stable service.

## Active development

In a dedicated feature worktree:

```sh
npm install
npm run dev
```

Vite uses port 5174. Pass `--port 5190` (or another free port) for additional worktrees. Reserve port 5173 for the stable game. Use a browser with WebGPU enabled. No API keys or server-side GPU are needed.

## Offline play and local co-op

Build once while dependencies are installed, then start the bundled server:

```sh
npm run build
PORT=5175 npm run play       # standalone offline solo, localhost only
# or
PORT=5175 npm run play:lan   # separate shared-defense session over a local network
```

For this separate session, open `http://127.0.0.1:5175/` on the host Mac. Leave the stable published game on port 5173 running. Assets, soundtrack, saves, and simulation stay local; starting `play` needs Node but no npm install, internet, account, or cloud service. Keep the terminal running. Saves are tied to the browser and host/port: port 5175 has its own run, separate from your stable 5173 save.

## Public co-op

Open the deployed HTTPS game, click **HOST CO-OP**, and send the room link to your partner. Both players use the production game interface, including tower placement/inspection/upgrades, research, infantry buildings, walls, dam controls, and wave controls. Your partner needs only a browser, with no repository or local server. Each browser has its own movable panels and soundtrack; the battlefield camera, active tools, selected units, Metal, and simulation are shared.

The host's browser runs the authoritative WebGPU simulation. The partner renders the full interface locally and receives battlefield images up to 1600 pixels wide. The hosted relay uses bounded HTTP requests so it can work on networks that block direct peer connections. It is a streamed battlefield, not a second 60 FPS simulation: frame delivery and command response depend on both internet connections. Keep the host tab visible and awake. The host chooses the map before creating the room. Room codes expire after four hours; **STOP CO-OP** closes the room immediately. Reloading the host requires a new room/link. Saves stay on the host browser and origin.

Local co-op remains available with `PORT=5175 npm run play:lan`; it uses the same interface with a local event stream. LAN traffic is plain HTTP; use a trusted local network.

Public deployment uses Sites with an R2 relay declared in `.openai/hosting.json`. `npm run build:site` produces the Worker and client assets. It requires FFmpeg and encodes all 22 soundtrack tracks at 32 kbps mono for smaller public downloads; original local/offline audio stays unchanged. The room's random host credential is kept in the host page; only its hash reaches stored room metadata. Guest requests cannot publish frames, read the host command queue, or close someone else's room. Room codes grant control, so send them only to your partner.

Validation: `node --test server/worker.test.mjs scripts/play.test.mjs` checks relay isolation and input bounds. `PORT=5205 node scripts/preview-cloud.mjs` serves a test-only in-memory version of the exact Worker, after `npm run build`. Copy `tests/public-coop/index.html` to `dist/tests/public-coop/index.html` and open `/tests/public-coop/` there for the real two-browser-interface test. Never use the preview adapter as a public server.

### On a plane

See [the complete hotspot setup, undo, and partner guide](docs/PLANE-COOP.md). It includes a macOS-only offline Wi-Fi hotspot workaround and explicit recovery steps. The partner needs only a browser.

- A shared Wi-Fi network can work without internet, provided it allows devices to reach each other. Airline networks may isolate passengers; this game cannot bypass that.
- A direct Thunderbolt connection can provide the local network without Wi-Fi. Use an actual Thunderbolt cable and configure **Thunderbolt Bridge** in macOS Network settings; see [Apple's IP over Thunderbolt guide](https://support.apple.com/guide/mac-help/mchld53dd2f5/mac).
- Do not rely on an iPhone hotspot in airplane mode: [Apple documents Personal Hotspot as sharing cellular data](https://support.apple.com/guide/iphone/iph45447ca6/ios).
- Connect the network before launching `play:lan`. If it changes, restart the server to refresh join addresses. If the join page cannot load, check that both Macs are on the same network and that macOS permits incoming connections for Node. No internet subscription is needed by the game itself.

Run `npm run test:local-server` for server/security checks. For the real two-player GPU test, build, copy `tests/coop/index.html` to `dist/tests/coop/index.html`, start `PORT=5201 npm run play:lan`, and open `/tests/coop/` on that dedicated port. It checks rendered stream pixels, shared placement/economy, wave start, flood, pause, and disconnect; it temporarily backs up that origin's saves. Do not run it alongside another game tab on the same test origin.

## Play

Use the **Battlefield** selector at the top of the sidebar to switch between **Campaign** and **Thunderhead Dam**. Each has separate autosave and checkpoint slots. Switching during combat resumes that battlefield from its last preparation save.

### Thunderhead Dam

Three floodable spillways include a permanently open central bypass between concrete turbine islands. Build towers on the concrete, close the north/south gates to divert enemies, and leave the central bypass covered. Gate operation has a three-second combat cooldown; a closure that would seal the last route is rejected. Buildings cannot occupy gate machinery.

Press **F** or **Release Flood** during combat to spend a full reservoir on a 3.2-second surge. It travels along all three water channels from the turbine end toward the inlet, damaging, slowing, and pushing enemies backward. The center always receives the surge, even when both side gates are closed. Closed side gates stop their water as well as enemies. The reservoir refills over 30 combat seconds, and pause freezes both the flood and recharge. The map starts with a full reservoir and the normal 3,000 Metal budget. Its first wave contains 1,320 enemies (10% more than the campaign opening); subsequent quotas and campaign waves are unchanged.


- **Crusher Gate [9] — 450 Metal:** build an open horizontal passage with hydraulic jaws. Press **G** or **Slam Gates** to fire all ready gates. The 8 × 10 jaw zone deals 60 damage, up to double in packed crowds before enemy crush resistance. Gates recharge in 8 simulation seconds, pause with the game, and start each new wave ready. Heavy Pistons favor damage; Rapid Hydraulics favor recharge. Gate kills earn salvage and veterancy.
- **Tesla Overload — 450 Metal research:** every sixth actual Tesla discharge strikes up to 12 targets with triple base damage and gentler chain falloff. Six charge lights show progress; the overload produces thicker violet lightning and sparks. Normal discharges retain their four-target limit (six with Storm Cell).

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

This is an early playable prototype with simple geometric art and initial balancing. Endless difficulty grows through composition, tempo, and enemy health while raw live population remains bounded. Towers and terrain constrain crowd movement; dam floodgates can change routes during combat. Mortar damage resolves on a firing tick, with visual impact cues. Full rigid-body corpses, arbitrary tower scripting, destructible terrain, and native packaging are not implemented.

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

Chain-link fences use the original Red Alert `cycl.shp` frame set imported from OpenRA's verified game-content package with OpenRA's `effect` (`temperat.pal`) palette. Barbed wire uses the original `barb.shp` frame set. Both are built as posts on the native 4-unit / 24-pixel art grid: nearby cardinally aligned posts automatically span panels, and corners or junctions select the corresponding original connected frame. A preview shows every new post/panel cell and its full cost before construction. See `public/assets/red-alert/NOTICE.md` for provenance and the repeatable import command.

The focused horde GPU suite at `/tests/horde/` checks offscreen movement, continuous boundary crossing, repeated dead-slot recycling, live-slot protection, and congestion feedback.

The Tesla effects lab at `/tests/tesla/` exercises the actual GPU chain, damage falloff, Storm Cell extension, range gaps, kill attribution, recycled slots, and reset. Its playback selector freezes the strike, skeleton, collapse, and ash stages. Tesla hits up to four distinct enemies (six with Storm Cell); each jump uses the coil's upgraded radius and loses power. Impact blasts are visual sparks and smoke, without additional splash damage. The standard game view uses the original Red Alert Tesla Coil and Flame Tower silhouettes for those two defenses; the Coil's bolt now leaves its raised cap, while the Flame Tower emits a short, stepped furnace jet and leaves infantry visibly burning beneath hard-edged pixel flames pinned from boots to shoulders. The remaining weapons retain the project's original directional artwork.

Tesla electrocution uses the original Red Alert `electro.tem` artwork with the temperate palette, imported by `npm run assets:red-alert`. Timing follows [OpenRA's infantry die6 sequence](https://github.com/OpenRA/OpenRA/blob/bleed/mods/ra/sequences/infantry.yaml): 80 ms frames, three repeats of the initial four frames, then collapse. The new GPU bolt renderer follows the bright-core/two-dim-strand appearance of [OpenRA's TeslaZap](https://github.com/OpenRA/OpenRA/blob/bleed/OpenRA.Mods.Cnc/Projectiles/TeslaZap.cs); its implementation is original. Original Red Alert artwork remains © Electronic Arts; see the atlas source metadata and [OpenRA's legal notice](https://www.openra.net/legal/).

## Infantry animation study

`/tests/infantry/sprites.html` on a feature Vite server compares rifle, rocket, flame, and samurai troops directly with shamblers using the real renderer. Select running, standing, firing, or collapse; pause and step to inspect poses. The sheet below shows eight facings and checks all 992 baked frames for missing or clipped artwork. It does not touch saved games.

Rifle, rocket, and flame troops use original Red Alert infantry sequences from OpenRA’s game-content package, with an olive-gold remap and a shared foot pivot. Samurai artwork is original and uses the same directional pixel presentation. Infantry now share world depth with zombies and scenery; running follows actual movement, firing continues through the weapon pose, and death holds a collapse frame before fading. This is presentation only: combat stats, recruitment, collision, and save formats are unchanged. See `public/assets/red-alert/infantry/NOTICE.md` for asset provenance and the repeatable import command.

The first five waves have 1,200 / 1,800 / 2,400 / 1,700 / 1,800 enemies. The first heavy waves trade numbers for tougher brutes, to avoid abrupt increases in combat workload and arrival duration. Subsequent waves use the capped escalation curve (12,000 enemies maximum). The opening targets roughly 60–90 seconds with a working defense at default frontage; narrow entrances, blocked approaches, and weak defenses can take longer. Preparation shows enemy composition and the clear reward; combat shows both enemies on the field and those still queued.

Run `/tests/wave-pacing/` on a dedicated development port and click **Run first five waves** for a continuous real-WebGPU playthrough. It starts with a 2,990-Metal Pine Valley defense, buys damage/fire-rate upgrades using actual earnings between waves, adds two rear autocannons before wave three and an ammunition forge before wave four, and selects the first command boon after wave three. It checks stream-width independence, forecasts, live/queued counts, preparation transitions, visible boon selection, and simulation errors. Each wave must engage within 25 simulated seconds, finish arrivals within 75 seconds, clear within 135 seconds, and avoid a 20-second stall after combat begins. After reaching wave four, **Replay waves 4–5 from earned checkpoint** can repeat the heavy waves from the actual saved wave-three result; replay results are labeled separately from a full run. The report includes timing, kills, integrity, and Metal; saves on the test origin are backed up and restored. This is a pacing regression for one viable defense, not a guarantee that every layout wins.

The spectacle lab at `/tests/spectacle/` checks actual GPU overload cadence, chain limits, damage, crusher bounds, packed-crowd damage, and kill attribution. **Freeze strike** holds the production renderer on the impact frame. `/tests/e2e/?spectacle` runs the focused real-game placement, research, autosave/reload, keyboard/button activation, pause, and recharge checks on a dedicated development origin.

The dedicated `/tests/dam/` playtest enters through the visible Battlefield selector, spends 2,710 Metal on a valid defense, operates both gates, reloads saved gate state, pauses a live flood, recharges and releases it again, and clears the actual first wave. It checks simulation health and that both campaign save formats remain untouched. `/tests/dam/gpu.html` checks exact flood bounds, upstream impulse, slow, kills, salvage, and that actual reservoir releases affect all three channels on the production GPU combat pipeline. Run on a dedicated port; the UI suite backs up and restores saves. Later campaign balance and a dam-specific boss are not part of this first map release.
