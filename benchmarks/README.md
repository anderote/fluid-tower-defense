# Benchmark procedure

Run `npm run dev`, open the local game, and select Lab. Test 5k, 10k and 25k requested population, recording the actual spawned population; the map's non-overlapping spawn area may hold fewer enemies than requested.

Measure an open flow and a congested choke separately. Record browser/adapter, viewport resolution, actual live population, simulation tick rate, median and p95 display frame time, invalid-particle count, and peak packing. Click blasts separately for the effects workload. Let only one GPU benchmark run at a time on this Mac.

Display refresh rate is not the simulation rate: the simulation uses a 60Hz fixed clock. Do not infer GPU compute milliseconds from display FPS. Optional GPU timestamps may be added after the first usable baseline.

No benchmark results have been recorded yet.
