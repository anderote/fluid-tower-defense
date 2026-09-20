# Gameplay architecture

Working design, September 19, 2026. Implements the planning direction agreed after [the technical research](RESEARCH.md). These are proposed gameplay rules and implementation boundaries; there is no playable implementation yet.

## Design direction

The player builds a machine for controlling a living crowd. Successful defenses shape where zombies collect, how pressure builds, and where that pressure is released. Direct-damage weapons remain useful for scattered enemies and dangerous specialists.

Three recurring decisions give the game its identity:

- **Concentrate or disperse?** Dense crowds are vulnerable to crushing and area damage, but a breached choke releases a dangerous surge.
- **Restrain or kill?** A slowing tower can make a crusher effective, but occupying space with control sacrifices immediate damage.
- **Specialize or cover weaknesses?** A pressure-heavy build struggles with resilient enemies; a sniper-heavy build struggles with mass.

Start with 2D simulation and top-down/isometric presentation. Keep the same rules for every camera style. Everything below should support a small first game and incremental additions.

## Run structure and economy

Use a deterministic wave director with authored ten-wave patterns, preparation between waves, branch upgrades, occasional bonus choices, and a boss every tenth wave. Wave 10 unlocks extraction; continuing retains the defense and repeats the pattern with broader compositions, higher tempo, and gradual health scaling. Raw population and spawn rate stay capped so endless difficulty does not become a hardware benchmark.

Preparation allows placement, selling, wall changes, inspection, and upgrades. During combat, allow upgrades and player abilities; defer geometry changes to preparation for the first release. This gives navigation and crowd pressure predictable boundaries while keeping combat interactive.

Use one spendable currency initially: **scrap**. Award a guaranteed wave payment plus enemy bounties. Ordinary crush kills receive the same bounty as other kills. Do not make pressure builds economically mandatory. Endless summons carry an explicit reduced or zero bounty, and deaths pay at most once.

Base damage is authored per enemy kind and budgeted with wave population; thousands of particles must not accidentally mean thousands of ordinary tower-defense lives. Crossing the base boundary consumes the zombie exactly once. Every scenario declares loss conditions and victory conditions explicitly.

A wave completes only when its spawn schedule is exhausted, pending spawns are resolved, and all relevant living enemies/bosses are gone. A jammed crowd cannot be skipped by a timer. If the live-particle capacity is reached, pending spawns wait under a documented scheduler policy; they are never silently discarded.

Start permanent progression with unlocks and alternate starting choices. Defer permanent numerical power increases until the baseline game is balanced.

## Runtime boundaries

| System | Owns | Boundary |
| --- | --- | --- |
| Content registry | Immutable tower, enemy, upgrade, bonus, effect, boss, and scenario definitions | Validates IDs, references, units, supported combinations, and limits before a run |
| Run controller / CPU | Scrap, construction, selected upgrades, wave schedule, bonus choices, player commands | Queues tick-stamped transactions; consumes confirmed GPU summaries |
| Navigation / CPU initially | Walkability, shared destination fields, placement validation | Publishes versioned fields and obstacle snapshots together |
| Combat and swarm / GPU | Live enemies, authoritative transforms/health/statuses, target selection, shots, crowd forces, deaths | Applies compact command buffers; exposes counters and bounded event streams |
| Boss coordinator | Authored state machine and encounter sequencing | Initial boss phase decisions execute against GPU-owned health on simulation ticks; CPU provides definitions and consumes transitions |
| Presentation | Sprites/meshes, sound, UI, particles, camera, overlays | Reads state/events; cannot change combat outcomes |

Use data-oriented arrays for the large swarm and ordinary structured objects for the small number of towers and run systems. Avoid one JavaScript object, scene node, or callback per zombie per frame.

The GPU owns tower targeting and firing clocks once deployed; the CPU owns purchase/upgrade intent. A confirmed upgrade changes effective combat stats at one known simulation tick. The UI can show pending commands but must not claim a purchase succeeded before validation.

## Content definitions and identities

Definitions use stable string IDs such as `tower.repulsor` and `enemy.brute`; a registry compiles these to compact numeric IDs for GPU buffers. Instance identity is separate from definition identity. Reused swarm slots carry a generation counter so an old projectile cannot hit a newly spawned zombie in the same slot.

Each definition has a schema version and display metadata. Save files identify the content version. Derived stats are rebuilt from the base definition plus selected modifications rather than repeatedly mutating the previous result.

Suggested definition shapes:

| Definition | Main fields |
| --- | --- |
| Tower | Cost, footprint, tags, targeting profile, weapons, passive fields, upgrade tree, presentation |
| Weapon | Cooldown, acquisition range, aim/turn behavior, delivery, effect bundle, target filters |
| Enemy | Body profile, health, speed/drive, defenses, behavior profile, traits, bounty, base damage |
| Upgrade | Prerequisites, exclusive group, cost, stat modifiers, weapon/effect changes |
| Bonus | Eligibility, scope, modifiers/triggers, stacking rule, maximum stacks |
| Boss | Body profile, phases, attacks, transition rules, encounter spawn commands, reward |
| Wave | Spawn groups, lanes, timing, threat budget, completion rules, rewards |

New combinations of existing effects should require content definitions only. A fundamentally new mechanism requires a new supported runtime primitive, shader implementation, validation, and focused tests. Do not promise arbitrary scripted behavior inside a GPU shader.

## Towers compose delivery, targeting, and effects

Separate **how a weapon reaches something** from **what it does**.

Delivery primitives: instant hit, moving projectile, impact circle, oriented cone, beam/segment, persistent area, and bounded chain traversal. Implement only those required by the current milestone.

Effects: typed damage, directional/radial impulse, continuous force field, status application, navigation attraction, and explicit spawn commands. Geometry changes are run-controller transactions, never arbitrary per-zombie effects.

Targeting modes: furthest along a reachable route, nearest, strongest, specialist/boss priority, and densest region. Densest-region targeting uses a coarse crowd field; it does not have to pick a particular zombie. Add hysteresis and retarget intervals so towers do not flicker between equivalent targets. LOS and projectile obstruction are explicit weapon properties.

An explosion's damage radius, impulse radius, falloff, and obstacle interaction are distinct authored properties. A pull field has a force budget, lifetime, and speed/displacement bounds. Particle death or visual intensity does not implicitly modify force.

## Enemy bodies, defenses, and statuses

Physical properties should include body radius/occupied area, inertial mass, desired speed, drive strength, damping, contact compliance, and crush tolerance. **Occupied area and mass are different:** a heavy small enemy should not appear to occupy a giant volume simply because it is hard to push.

For mixed crowds, estimate packing from occupied area with a calibrated kernel; compute inertia separately. Validate mixed-size neighborhoods before introducing large physical size ratios. Avoid an arbitrary mass-weighted density rule that makes nearby zombies take damage merely because a heavy enemy exists.

Separate damage channels—initially kinetic, blast, crush, heat, and electric—from movement properties. Armor can reduce kinetic damage without implying crush resistance. Display meaningful resistances and strong vulnerabilities; avoid universal immunity tags by default.

Use a fixed set of GPU status channels rather than a dictionary per zombie. Each channel specifies duration, magnitude, source handling, reapplication, and cleanse rules:

| Status | Rule |
| --- | --- |
| Slow | Strongest magnitude wins; reapplication refreshes the chosen duration; affects self-propelled speed, not external impulse |
| Stun | Suppresses drive/attacks for a bounded duration; the body still moves and can be crushed |
| Brittle | Increases specified damage susceptibility, including crush where authored; does not silently change body mass |
| Burn | Bounded damage-over-time channel with explicit stacking/cap and credit policy |
| Conductive | Marks eligibility/strength for bounded electric propagation |
| Attracted | Adds a bounded navigation bias; respects obstacles and reachable routes |

Run resistance calculations in a documented order and clamp to permitted ranges. Make crowd control useful on bosses through diminishing effectiveness or resistance rather than blanket immunity, except where a telegraphed phase explicitly changes the rules.

## Upgrades and bonuses

Each tower can have common early upgrades followed by mutually exclusive specialization branches and a capstone. Store prerequisites as an acyclic graph with exclusive groups; a three-tier tree is a UI choice, not an engine restriction.

Use this stat pipeline: **base + additive changes, then summed additive percentages, then explicitly multiplicative modifiers, then caps/overrides**. Priority decides conflicting overrides. Units are explicit: seconds, world distance, health, and impulses. Price, cooldown, force, projectile count, radius, and status magnitude have legal bounds.

Changing attack speed preserves normalized cooldown progress. New shots use the new compiled stats; already-fired projectiles retain their launch snapshot. Upgrading does not refill ability charges unless the upgrade explicitly grants that benefit.

Run bonuses use the same modifier system but target tags, selected towers, enemy conditions, or the whole run. Their tooltips identify affected content. Separate economic, tactical, and physics bonuses so choices can trade immediate survival against future value.

Triggered bonuses subscribe to a small explicit event vocabulary such as tower fired, damage threshold crossed, enemy killed, wave completed, and boss phase changed. Use source IDs, trigger depth limits, cooldowns, and per-tick work budgets. Cosmetic secondary effects may be dropped; gameplay effects require deterministic queuing or a documented bounded mechanic. Do not let an on-kill explosion recursively generate unbounded explosions.

Crush kills pay normal rewards and count toward pressure-focused bonuses. Initial pressure attribution is team/environment-level; avoid pretending that the final zombie pushing a neighbor identifies the responsible tower. Per-tower pressure assists can be added as an explicitly approximate statistic later.

## Bosses and specialist behaviors

Bosses should alter the crowd problem. Give them clear telegraphs, attack windows, phase transitions, and opportunities to exploit pressure. Keep active boss count small and behavior as a finite state machine, with each phase composed from supported attacks and fields.

A large boss must have an explicit body representation. Begin with a kinematic/force-limited collision shape coupled to nearby swarm particles, with authored resistance to aggregate impacts. Do not represent a giant boss as an ordinary SPH particle with an enormous interaction radius. Full physically coupled multi-particle bosses are a later solver feature.

Every boss definition declares allowed routes and minimum clearance. Placement validation checks those routes before the wave. If a later boss can destroy walls, that must be a visible rule with a supported topology update—not an escape hatch for invalid routing.

Phase transitions occur once at a simulation tick. Incoming damage for the tick resolves before thresholds are evaluated; choose the highest applicable phase if several thresholds are crossed. Death takes priority over starting another phase. Persistent attacks and summoned enemies have explicit cleanup and reward policies.

## Simulation order and reliable events

Use a fixed simulation clock independent of display FPS. A proposed tick order is: apply validated commands and spawns; update statuses and boss intentions; acquire targets/fire; advance projectiles and persistent effects; apply impulses; run crowd substeps and obstacle contacts; accumulate pressure exposure; resolve damage; resolve death/base arrival; emit summaries; publish render state.

Pressure exposure accumulates using substep duration; weapon cooldowns and statuses must not advance once per substep by accident. Define same-tick precedence: death resolution precedes base arrival, so an enemy killed on the boundary does not also leak. Zero health immediately excludes an enemy from future eligible combat passes.

Each settlement has a monotonically increasing batch ID, simulation tick, and run epoch. CPU consumption is idempotent, and restart invalidates results from the previous epoch. Persistently accumulate earned currency, leaks, and counts on the GPU until acknowledged so a dropped decorative event cannot lose money or base damage.

Critical event/command queues have capacities, telemetry, and backpressure. Never silently drop boss transitions, rewards, or required spawns. Gameplay chains use bounded GPU worklists; sound and debris use independently droppable presentation events. Reserve enough capacity for a whole tick or defer work before starting it.

Avoid same-frame CPU readback dependencies for targeting and damage. Read summaries asynchronously. Enter a settling state after the last enemy disappears until outstanding summaries are consumed; only then award the wave and unlock the next preparation phase.

## Maps, saves, and observability

Maps contain spawn lanes, base zones, build regions, obstacles, navigation classes, and boss routes. Validate reachability and physical clearance, including diagonal gaps. Initially keep obstacles static during combat; dynamic destruction requires synchronized collision/navigation publication later.

Save between waves first: scenario/seed, wave, economy, towers and upgrades, bonuses, base health, content version, and resolved progression. Mid-wave saving requires GPU state snapshots and is deferred. Seeded randomness helps reproduce scenarios, but exact GPU results across devices are not assumed; tests compare invariants and bounded outcomes.

Developer tools should expose live population, queued spawns, cell occupancy, pressure heatmap, damage by channel, applied statuses, frame timings, dropped cosmetic events, critical queue pressure, and boss state. Tower inspection shows effective stats and where modifiers came from.

## Build sequence

1. **Physics lab:** one choke, 10,000 configurable zombies, wall-backed/open-field blasts, repulsor, pressure visualization, and stability/performance checks. No economy required.
2. **Playable loop:** base, scrap, placement, authored waves, four towers, three enemy kinds, and a win/loss state. Tower/enemy definitions already use the registry.
3. **Build variety:** upgrade branches, bonus choices, slow/brittle interactions, reliable rewards, between-wave saves, and one boss.
4. **Expand after measurement:** chain electricity, heat propagation, specialist behaviors, additional bosses, richer animation, terrain destruction, and larger counts.

Test content references and upgrade cycles, modifier ordering, exactly-once rewards, stale target handles, status refresh rules, phase/death precedence, placement clearance, and critical queue backpressure. Simulation checks must cover mixed enemy sizes, dense jams, timestep changes, and repeated blasts. Performance quality settings can reduce graphics; they must not secretly change damage, neighbor completeness, or boss rules.
