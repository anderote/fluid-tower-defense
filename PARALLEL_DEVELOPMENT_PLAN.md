# Parallel development plan

Status: ready to turn into implementation assignments. No implementation agents have been launched by this planning step.

Goal: deliver a browser game with a GPU-driven compressible crowd, four useful towers, three zombie kinds, upgrade branches, run bonuses, and one boss. Establish a measured 10,000-enemy target on the local M4 Max before growing the feature set. Frame rate remains an acceptance target, not a guarantee.

Inputs: [research](RESEARCH.md), [gameplay architecture](GAMEPLAY_ARCHITECTURE.md), and [content direction](CONTENT_DESIGN.md).

## Team and scheduling

This session currently supports four active agents including the lead: **one lead plus three workers**. Schedule a rolling queue within that limit; do not assume a larger configuration can expand the current session's capacity.

| Role | Initial assignment | Suggested model / effort | Reason |
| --- | --- | --- | --- |
| Lead / integrator | Interfaces, runtime wiring, code review, integrated validation, critical fixes | Current primary agent | Maintains decisions across systems and keeps the main build working |
| A / simulation | GPU spatial grid, pressure, motion, then combat and boss execution | `gpt-5.6-sol`, high | Numerics, memory layouts, pass ordering, and race conditions have costly failure modes |
| B / presentation | GPU instancing, camera, debug controls, then HUD and effects | `gpt-5.6-terra`, medium | Bounded deliverables with fixtures and visible acceptance checks |
| C / gameplay | Content compilation and navigation, then waves, economy, progression, saves | `gpt-5.6-terra`, medium | Mostly CPU-side rules with explicit interfaces and focused tests |

These are project-specific starting assignments, not measured speed comparisons. OpenAI describes Sol as suited to complex work and Terra as a general-purpose choice in its [model guidance](https://learn.chatgpt.com/docs/models). Adjust based on working, integrated results. Promote a blocked numerical or state-consistency problem to the lead/Sol; keep straightforward content additions and UI changes on Terra. Luna is optional for repetitive definition authoring only after the schema and examples are established; do not consume a worker slot with it while a critical implementation job is ready.

Prefer stable workers across related tasks to preserve context. Give replacements a short brief, files, and an accepted base commit. Do not require every worker to ingest the entire conversation. Explicit model/effort assignments are part of each delegation.

## The essential first step: a small shared foundation

**P0 — lead-owned, before independent implementation.** Create the minimal TypeScript/browser toolchain, Git baseline, module skeleton, and executable contracts. Verify the GPU adapter and one tiny compute-to-render path on this machine. This is deliberately narrow; do not design a general game engine first.

Deliver:

- A local app, typecheck/build/test commands, and a working WebGPU bootstrap with useful unsupported-device and device-loss handling.
- `src/contracts/`: content IDs and definitions, command/result envelopes, world coordinates/units, run-state/UI models, rendering views, navigation snapshots, and the module interfaces below.
- One source of truth for CPU/WGSL layouts, field offsets, strides, enums, and binding conventions, with a small round-trip GPU check. Reserve only the fields needed for the first milestone; version future changes explicitly.
- A root-owned runtime that owns the GPU device, resource allocation/lifetime, simulation clock, command encoder/submission, render scheduling, and asynchronous readback. Modules encode work; they do not independently create devices or submit queues.
- A renderer fixture that fills GPU buffers with recognizable static enemies; a scripted simulation adapter that emits commands/settlements for CPU rules/UI tests. Fixtures are clearly labeled development modes and cannot satisfy live-game acceptance.
- Importable module factories that compile before implementation. Unknown functionality reports unsupported/pending status instead of pretending to succeed.

Keep the initial UI lightweight: DOM/CSS around the GPU canvas is sufficient. The lead owns dependency choices, package manifests/lockfiles, and shared tooling so workers do not independently choose incompatible frameworks.

### Contracts to freeze for batch 1

| Contract | Agreement needed | Consumers |
| --- | --- | --- |
| Swarm view | Buffers and stride/offsets, capacity versus live count, position/orientation/body/type/health/pressure fields, stable handle/generation, read/write ownership | Physics, rendering, later targeting |
| Tick context | Seconds and tick index, substep semantics, encoder access, resource versions; only lead runtime submits | All GPU modules |
| Simulation commands | Spawn batches, direct impulses, map snapshot, reset; run epoch, sequence, apply tick, acceptance/backpressure | UI lab, run controller, simulation |
| Combat extensions | Tower update, compiled weapon/effect definitions, target handle, shot snapshot, damage/status input conventions | Combat and gameplay in batch 2 |
| Settlement snapshot | Epoch/tick/sequence, accepted commands, cumulative bounty/leak/death totals, live/pending counts, critical-event watermark | Run controller, UI, wave completion |
| Navigation snapshot | World origin/cell scale, blocked cells, destination distance/direction, clearance class, topology version | Physics and placement |
| Run API | Actions such as place/sell/upgrade/start wave/choose bonus; immutable UI view and pending/error results | Rules and UI |

The lead writes exact signatures/layouts during P0; this plan does not prescribe guessed byte offsets. Freeze an actual generated schema and compile fixtures against it before launching the dependent workers. Define shared coordinate orientation and camera picking conversions explicitly.

Initially retain fixed particle slots and stable handles, plus a separate sorted cell-index array. This avoids forcing renderer, targeting, and identity remapping changes whenever physics reorders neighbor data. A later compaction change needs a versioned contract.

Choose one settlement scheme initially: monotonic cumulative counters per run epoch, with CPU-side last-applied watermarks. Never clear a cumulative total just because a readback was requested. Reserve critical transition records until consumption; use separate, droppable cosmetic events. This prevents independent agents from building incompatible reward/acknowledgment protocols.

## Three parallel implementation batches

Each row is concurrent work. A worker can start a ready next task after a checked handoff, without waiting for unrelated polish. Milestone acceptance still requires the real integrated behavior.

| Batch | A — Sol | B — Terra | C — Terra | Lead work in parallel |
| --- | --- | --- | --- | --- |
| 1: physics lab | PHY-1: spatial indexing, packing/pressure, movement, collision, compression exposure | VIS-1: instanced zombies, camera, map view, pressure overlay, lab controls | DATA-1 then NAV-1: registry/initial definitions, choke map, flow field and clearance | Runtime orchestration, fixtures, counters, benchmark harness, incremental integration |
| 2: playable game | COM-1: targeting, firing, impacts, slow/brittle, health/death/leak resolution | UI-1: construction preview, tower inspection, HUD, wave controls, end states | RUN-1: economy, placement transactions, authored waves, progression state machine | GPU/CPU command bridge, real end-to-end tests, mixed-crowd stability and tuning |
| 3: build variety | BOSS-1: boss phases, limited collision proxy, charge/escort behavior | FX-1: shot/impact/status cues, boss telegraphs, sound, upgrade/bonus presentation | PROG-1: modifier compiler, branch upgrades, bonus choices, between-wave saves, boss content | Correctness review, boss/navigation integration, balance scenarios, sustained benchmarks |

Dependency path: `P0 → PHY-1 → COM-1 → BOSS-1`. Rendering proceeds from fixtures after P0. CPU gameplay proceeds from scripted settlements after DATA-1. Neither needs to wait for finished physics to begin, but neither is finished until integrated.

DATA-1 and NAV-1 are sequential assignments for C, not two extra workers. Likewise, PROG-1 should ship modifiers, then upgrades/bonuses, then saves as small handoffs. If a task becomes too broad, divide deliverables and queue them; do not create hidden ownership overlaps.

### Batch 1 exit: a real physics lab

Run an open area feeding a choke with configurable shamblers/runners/brutes. Show 10,000 living particles, click-triggered blasts, a directional repulsor, pause/single-step/reset, and an optional packing heatmap. The root runtime applies impulses even before automated combat exists.

PHY-1 exports compression exposure and a diagnostic crush-ready flag; it does **not** own health settlement. COM-1 later consumes exposure for authoritative damage and deaths. This boundary keeps two modules from independently paying rewards or killing the same entity.

Check finite values, neighbor completeness, obstacle tunneling, loose-crowd baseline, wall-backed pressure, mixed-body behavior, timestep sensitivity, and correct reset. Record frame timings at 5k/10k/25k populations and occupancy under jams. Report measured capacity honestly; unresolved instability blocks combat integration, while modest rendering polish can continue independently.

### Batch 2 exit: an actual game

One map; repulsor, mortar, autocannon, cryo emitter; shambler, runner, brute; a short authored wave sequence; scrap and base health; construction and selling in preparation; combat upgrades reserved for batch 3; win/loss/restart.

COM-1 owns all health mutations and exactly-once death/leak settlement. Physics writes pressure/contact/exposure inputs; combat turns them into outcomes. Keep input/output ownership explicit even where several kernels share a buffer.

Check purchases, rejected placement, insufficient currency, queued spawns at capacity, dead target handles, same-tick death/base precedence, slow without freezing external motion, and completion only after readbacks settle. Demonstrate at least one useful crush combination using real effects.

### Batch 3 exit: meaningful variety

Two specialization branches for each initial tower, a small set of compatible run bonuses, the Bulldozer boss, and save/load between waves. Validate bonus eligibility, modifier order, cooldown changes, branch exclusivity, boss death/phase precedence, finite summon rewards, restart epoch rejection, and versioned saves.

The boss may build on already-supported impulses and fields; body interaction must be tested before content assumes it works. UI may prototype telegraphs against fixtures while the boss kernel is in progress.

## File ownership

Proposed tree, created during implementation:

```text
src/
  contracts/                 lead: schemas, interfaces, GPU ABI
  runtime/                   lead: device, resources, clock, pass order, bridge
  sim/physics/               A: neighbors, pressure, integration, collisions
  sim/combat/                A: targets, weapons, statuses, settlement
  sim/bosses/                A: boss execution and physical proxy
  render/                    B: GPU drawing, camera, overlays, render shaders
  ui/                        B: HUD, menus, controls, inspection
  audio/                     B: sound presentation
  content/                   C: definitions, validation, stat compilation
  navigation/                C: flow fields, clearance, maps
  game/                      C: waves, transactions, economy, progression
  persistence/               C: saves and migrations
  app/                       lead: composition root, routing, input wiring
tests/
  fixtures/                  lead: shared executable examples
  integration/               lead: live-system scenarios
benchmarks/                  lead: scenarios, runner, reports
```

Module-local tests belong to that module's worker. Shared configuration and shared test fixtures remain lead-owned. Rendering consumes a view of simulation data; it does not import physics implementation internals. UI consumes Run API; it does not charge money or mutate GPU health itself.

## Task acceptance and ready-to-send briefs

Every assignment specifies base commit, exclusive write paths, read-only contracts, exact exports, fixture to use, acceptance checks, and deferred features. Workers report the commit, tests actually run, limitations, and any requested interface changes. A task is incomplete if it compiles only with private replacements for shared contracts.

**PHY-1 brief — Sol/high:** Read the frozen contracts and physics sections of RESEARCH/GAMEPLAY_ARCHITECTURE. Own `src/sim/physics/**` and local tests. Implement bounded-domain spatial indexing without silently truncating neighbors, occupied-area packing, pressure/drive/damping/impulses, obstacle contacts, and exposure integration. Encode passes through the provided runtime API. Prove small known-neighbor cases and pressure invariants, then exercise the agreed GPU lab. Do not change shared layouts, create a second GPU device, implement tower firing, or settle health. Deliver working indexing first, then movement/pressure, then stability/performance evidence.

**VIS-1 brief — Terra/medium:** Own `src/render/**` and lab-specific UI under an assigned `src/ui/lab/**` path. Render the agreed swarm view through instanced sprites/simple geometry. Implement camera transforms, selection/picking coordinates, map obstacles, heatmap, and accessible pause/count/blast controls through the provided action interface. Use the shared GPU fixture until physics is available. No per-enemy CPU readback. Verify recognizable enemy kinds, camera/picking alignment, resize handling, and live-buffer integration. Defer production artwork and advanced effects.

**DATA-1 / NAV-1 brief — Terra/medium:** Own `src/content/**` and `src/navigation/**`. First validate and compile four tower/three enemy definitions against lead-owned schemas. Reject unsupported effects, invalid references, nonfinite/out-of-range values, and duplicate IDs. Then implement a static choke map, versioned navigation snapshot, spawn regions, shared flow field, and route/clearance validation with small hand-checkable fixtures. Keep initial body sizes within the solver contract. Do not add new combat primitives or modify schemas without coordination.

Later briefs reuse the same format and the accepted current commit. Avoid vague tasks such as “build all bosses” or “make the game fun.” Assign one supported mechanic plus one demonstrable encounter/combination.

## Integration discipline

1. Initialize a project repository during P0 if needed, preserving these documents. Create isolated worktrees/branches under `.worktrees/`, gitignored, so each worker has a stable checkout. This retains the current folder as the main project and does not recreate the removed sibling folder.
2. Give workers absolute working directories and unique dev-server ports. They stage/commit only their own worktree. The lead alone integrates onto the main branch; no worker changes the main checkout or another worker's files.
3. Merge small coherent commits as soon as their interfaces and checks pass. Use a single integration strategy consistently; cherry-pick self-contained commits and record their source, then base subsequent assignments on the accepted main revision.
4. For contract changes, a worker sends the exact required change and reason. The lead updates the schema, generated declarations, fixtures, and all affected consumers in one coordinated change. Workers continue independent tasks while this happens.
5. Build/typecheck and run relevant tests on the integrated revision. Shader compilation and CPU/GPU layout checks run on a real adapter; TypeScript success alone is insufficient.
6. Reserve one GPU benchmark/browser-validation slot. Independent CPU tests can run concurrently, but three GPU benchmarks on the same Mac would corrupt timing evidence. Only the lead launches sustained benchmarks; workers request short GPU checks or run them when that slot is free.
7. Follow the standing browser rule: dedicated automation tabs only. Reuse the task's automation surface for integration tests; never repurpose the user's existing tabs.

Keep a lead-owned task ledger with task ID, owner, status, base/accepted commit, dependency, and blocker. Report progress as integrated behavior—“wall-backed impulses now crush enemies”—rather than files written or number of agents running.

## Avoiding a new bottleneck

The first solver is intentionally one owner's job because spatial indexing, density, timesteps, and collisions are tightly coupled. After its buffers and passes stabilize, a future slot can take a bounded kernel or benchmark independently. Splitting each kernel among agents before that point risks incompatible numerical assumptions.

Similarly, do not assign each tower to a separate agent early: all would need to modify the same targeting/effect engine. Build shared delivery/effect primitives first; then different agents can safely author separate tower families, enemy definitions, wave packs, and visuals.

The lead should review short commits, not take over every implementation. If integration becomes the bottleneck, hold new feature starts and resolve it; accumulating unmerged branches does not accelerate the playable build. If a worker finishes early, use it for a ready CPU task or a focused independent review of a specific accepted change.

Do not promise a linear speedup or a wall-clock completion time before measuring the first batch. Track time to accepted behavior and rework. Keep the physics/combat owner on the critical path while other workers progress on fixture-backed modules.

## Deferred expansion queue

Once the first three batches pass: arc chains/conductivity, heat and propagation, attractors, support auras, specialist enemies, additional wave packs, advanced effects, and later bosses can become smaller parallel tickets. Dynamic terrain/crushers, giant multi-particle bodies, persistent physics corpses, full 3D stacking, native packaging, multiplayer, and mid-wave saves remain separate projects with their own dependencies.

The next executable step is P0, followed immediately by PHY-1, VIS-1, and DATA-1 in parallel. The first deliverable is the measured physics lab, followed by the playable loop and then progression/boss variety.
