# Benchmark procedure

## Repeatable performance laboratory

Open `/tests/performance/?autorun` on a feature Vite server. Options:
`scenario=open|dense|obstacles|combat|aftermath`, `population=6000`, `frames=36`,
`only=all|physics|combat|render`, `timestamps=off`. Defaults run all five fixtures.
The page exposes a JSON report in `#results` and completion in `#status`.
Population is restored each frame, deliberately measuring a fixed workload rather
than a shrinking crowd. This is not a gameplay-throughput test. One simulation
step is submitted per display callback, with queue depth bounded by completion;
its simulation/wall ratio can exceed 1 on high-refresh displays.

GPU timestamps are optional and quantized (observed 0.065536 ms increments on
Apple); zero means below resolution, not free. CPU encode and completed-work
latency are reported separately. Production `?profile` enables bounded asynchronous
GPU pass timings in developer diagnostics. Simulation/wall-time ratio is always
reported and excludes pauses. Existing saves are not accessed by the laboratory.

`baseline-6000.json` records the initial 24-frame sample. Physics was approximately
0.13 ms combined in the dense fixture, versus target-selection p95 8.32 ms with
24 mixed towers. These fixtures do not yet reproduce the live 188.5 ms symptom.
The aftermath fixture in this initial file is an early battle with few deaths,
not a saturated long-running corpse field. Compare controlled fixtures directly,
not their absolute FPS against a different live session. Concurrent user GPU work
is uncontrolled and must remain untouched.

Run `npm run dev`, open the local game, and select Lab. Test 5k, 10k and 25k requested population, recording the actual spawned population; the map's non-overlapping spawn area may hold fewer enemies than requested.

Measure an open flow and a congested choke separately. Record browser/adapter, viewport resolution, actual live population, simulation tick rate, median and p95 display frame time, invalid-particle count, and peak packing. Click blasts separately for the effects workload. Let only one GPU benchmark run at a time on this Mac.

Display refresh rate is not the simulation rate: the simulation uses a 60Hz fixed clock. Do not infer GPU compute milliseconds from display FPS. Optional GPU timestamps may be added after the first usable baseline.

## Initial smoke sample — 2026-09-19

Local Apple WebGPU adapter on M4 Max; 10,000 particle slots initialized. Display median was about 8.3 ms (120 Hz), p95 about 9 ms. At 31 seconds of simulated time, 4,495 remained alive and 5,505 had been crushed; invalid-particle and readback-error counts were zero. This is a shrinking-population smoke sample, not a sustained 10,000-live benchmark or GPU compute timing. Further controlled benchmarks remain to be run.
