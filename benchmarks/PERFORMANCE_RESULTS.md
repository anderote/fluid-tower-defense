# Performance program results

## Outcome

Normal gameplay retains the exact particle simulation. Spatial terrain and target
queries, cached tower definitions/uploads, independent tower scheduling, and
presentation-only quality controls are implemented. Optional CPU/GPU attribution
and a reproducible browser laboratory make the next performance pass measurable.

This work did not restart or publish the stable service, navigate/reload the
user's game, or promote main. Other concurrent work did advance and publish main
during this program; this report does not claim the whole workspace was frozen.
Feature commits were validated and integrated into local dev stage by stage.

## Controlled comparisons

Apple WebGPU, 1920 × 1080 benchmark backing canvas, 6,000 particles unless noted,
24 mixed towers in combat. Each comparison used reference → optimized → optimized
→ reference ordering, eight warmup frames, and 120 measured frames per trial.
The user's game and other applications remained running. Values below are ranges
across the two repetitions, **not pooled percentiles or uncontended capacity**.
Raw reports: [paired-results-2026-09-20.json](paired-results-2026-09-20.json).

| Change / fixture | Reference | Optimized | Decision |
| --- | --- | --- | --- |
| Spatial targeting, 6k: GPU target p95 | 8.32–8.45 ms | 1.77–1.90 ms | Enabled; exact reference parity |
| Spatial targeting, 6k: completed-work median | 3.3–3.6 ms | 2.3–2.9 ms | Lower total work as well as pass cost |
| Terrain index, 400 obstacles: sum of physics substep medians | 0.590 ms | 0.131 ms | Enabled; exact collision/telemetry parity |
| Spatial targeting, 25k, level 50 / veterancy 100: target p95 | 37.81–38.14 ms | 10.62–10.75 ms | Enabled; removes the worst broad scans |
| Same 25k trial: completed-work p95 | 41.0–41.7 ms | 13.9 ms | Large tail-latency improvement in this fixture |
| Independent tower workgroups, indexed 25k: target p95 | 9.44–9.83 ms | 8.39–8.72 ms | Enabled; smaller additional improvement |
| Blood compaction, settled saturated field: completed-work median | 3.2 ms | 3.0–3.1 ms | Inconclusive across earlier trials/tails; opt-in only |
| Hybrid crowd, 6k jam: sum of physics substep medians | 0.393–0.524 ms | 0.262 ms | Opt-in only; changes pressure casualties |

The first target comparisons predate independent workgroups. The later dispatch
comparison isolates scheduling, with spatial targeting enabled on both sides.
Do not multiply their ratios or describe them as one final paired speedup.
GPU timestamps were quantized in 0.065536 ms increments: zero is below measurement
resolution, not zero work. Completed-work latency includes encoding, submission,
queue waiting and completion; it is not just GPU compute time. Reference rendering
is the default; compaction remains available in the lab with `blood=optimized`.

The original live ~188.5 ms median / ~264 ms p95 symptom was **not reproduced by
these controlled fixtures**. This report does not prove that a particular live
save is fixed. The new `?profile` diagnostics distinguish CPU phases, GPU passes,
simulation/wall progress and presentation resolution on a newly opened game.
No reload was forced on the user's existing session.

## Evolving battle and conservation

The 6,000-slot soak ran 1,800 measured ticks (30 simulation seconds, plus warmup).
Surviving enemies retained state; dead slots were replenished with the production
GPU allocator. Final counts: **9,452 arrivals = 5,998 survivors + 3,454 deaths**,
including 228 crush deaths. Reward total was 207 Metal; invalid state and GPU
errors were zero. Display median was 8.3 ms and p95 8.8 ms; completed-work median
2.5 ms and p95 4.7 ms. This is a recycling stress test, not natural wave pacing or
proof of a multi-hour memory-leak-free run.

An exploratory 50,000-enemy / maximum-tested-upgrade fixture stopped responding
to browser inspection and did not yield a benchmark report. Fresh-tab GPU
regressions continued to pass. Its cause remains unverified; **50k support and
real-time performance are not established**. Do not treat an unreported stress
run as a pass or repeat it in a user's active game. The temporary test tab was
identified to the user for manual closure when automated closure also timed out.

## Exactness versus approximation

Terrain parity covers thin and offscreen walls, embedded recovery, dynamic edits,
particle state and obstacle telemetry. Combat parity covers all eight weapons,
focus changes, slot-generation reuse, empty populations, firing state, counters
and Tesla chains. Tests use the real GPU shaders, not a CPU substitute.

The hybrid contributes every body to an area/velocity grid, uses 64/48-neighbor
hysteresis, and limits dense local contacts to 72 visits. Sparse behavior matches
the exact solver. Dense pressure does not: one final check produced 81 exact vs
124 hybrid deaths; the mixed-species blast case produced 96 vs 139. Repeated runs
vary because GPU linked-list ordering and dense floating-point accumulation are
not deterministic. Accounting and thin-wall collision passed, but the balance
difference rules out automatic promotion. See [HYBRID_CROWD.md](HYBRID_CROWD.md).

Automatic graphics quality only changes battlefield resolution, within 0.5–1.0.
It waits for sustained slow frames, trials a reduction, rolls it back if frame
time does not improve by at least 8%, and recovers detail slowly. Paused/hidden
frames do not trigger adaptation. Manual High/Balanced/Performance controls do
not alter saves, collision steps, firing cadence, rewards, or UI sharpness.

## What to optimize next, and the promotion gates

1. **Very large-radius target/Tesla queries:** parallel candidate reductions and
   contiguous cell lists are the next exact-algorithm candidates if target cost
   remains dominant. Preserve score/slot tie ordering, boss priority, focus,
   generation checks, and per-hop visited sets. First reproduce the 50k failure
   in an isolated disposable session; do not assume it has the same cause.
2. **High-density simulation:** calibrate field pressure/contact response over
   multiple seeds, species mixtures, bottlenecks and blasts before promoting the
   hybrid. Compare casualties, throughput and wall loads, not just milliseconds.
3. **Alternative continuum/cohort simulation:** a genuine redesign, not a free
   optimization. A potential-field continuum model is an established approach
   ([Treuille et al., Continuum Crowds](https://grail.cs.washington.edu/projects/crowd-flows/)),
   but adapting it here would require an explicit model for individual targeting,
   damage ownership, rewards, splitting and merging. This prototype is not an
   implementation of that paper's solver.
4. **Effects and damage work:** consider corpse baking, Tesla draw compaction or
   compact active-attack lists only when their pass timings justify the extra
   scans/storage. Damage passes were generally below ~0.066 ms in the initial
   6k fixtures. Blood compaction already demonstrated why fewer vertices alone
   do not guarantee a faster frame.
5. **CPU/UI/navigation:** use the new CPU phase medians/p95/max before changing
   update cadence, autosaves, spatial-index rebuilds or steering. Keep collision
   dt and firing logic fixed; do not slow gameplay to make the FPS display rise.

Independent workgroups expose scheduling freedom, not a portable speed guarantee;
the shader execution contract is described by the [WGSL specification](https://www.w3.org/TR/WGSL/#compute-shader-workgroups).
Performance promotion always requires paired measurements on target hardware.

## Commit stages

Final verification includes the CPU tests/build and real-browser GPU suites:
9 performance correctness checks; 12 blood checks; 14 Tesla checks; 94 heavy-
weapon checks; fire damage/panic/generation checks; 5 horde checks; 12 aftermath
checks; 12 occlusion pixel checks; 96 animation checks with 1,152 sprite frames;
and 4,096 simultaneous-kill reward/XP accounting. Captured output is in
[final-regression-2026-09-20.json](final-regression-2026-09-20.json).
The active-game CPU profiler smoke test reached tick 822 with exact simulation,
no GPU errors and no readback errors. Profiling itself adds overhead: timing
summary sorting was subsequently limited to 1 Hz, rather than the 10 Hz UI rate.

- `18f965c`: execution plan.
- `1b2b1cd`: bounded GPU profiling and deterministic laboratory.
- `aa879c6`: conservative terrain broad phase and upload caching.
- `f152e10`: spatial targeting and tower-definition caching.
- `8f56796`: stable blood-compaction prototype and render scaling.
- `a6913a5`: explicit hybrid crowd research mode.
- `ecae90f`: reversible adaptive resolution and manual quality controls.
- `c1bd69d`: paired/evolving tests, scheduling improvement, conservative defaults.
- Final validation commit: CPU attribution, archived evidence, regression record
  and this report. Integration commits also preserve concurrent dev changes.
