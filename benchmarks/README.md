# Benchmark procedure

Run `npm run dev`, open the local game, and select Lab. Test 5k, 10k and 25k requested population, recording the actual spawned population; the map's non-overlapping spawn area may hold fewer enemies than requested.

Measure an open flow and a congested choke separately. Record browser/adapter, viewport resolution, actual live population, simulation tick rate, median and p95 display frame time, invalid-particle count, and peak packing. Click blasts separately for the effects workload. Let only one GPU benchmark run at a time on this Mac.

Display refresh rate is not the simulation rate: the simulation uses a 60Hz fixed clock. Do not infer GPU compute milliseconds from display FPS. Optional GPU timestamps may be added after the first usable baseline.

## Initial smoke sample — 2026-09-19

Local Apple WebGPU adapter on M4 Max; 10,000 particle slots initialized. Display median was about 8.3 ms (120 Hz), p95 about 9 ms. At 31 seconds of simulated time, 4,495 remained alive and 5,505 had been crushed; invalid-particle and readback-error counts were zero. This is a shrinking-population smoke sample, not a sustained 10,000-live benchmark or GPU compute timing. Further controlled benchmarks remain to be run.
