# Performance execution plan

Status: active. Baseline: local dev `c520abf`. Worktree: `.worktrees/performance-program`.
Root main and the published service are outside this task's mutation scope.

## Outcome and decision rules

Make large, congested battles measurably cheaper while preserving enemy identity,
health, damage ownership, rewards, wall collision, and pressure gameplay. Target
60 Hz presentation and real-time simulation where the machine/workload supports
it; report measured limits rather than guaranteeing an unmeasured population.
The previously observed 188.5 ms median is a live symptom, not a subsystem profile.

Every stage gets a focused commit, validation record, and integration into local
dev. Feature development remains here, based on dev. If dev moves independently,
merge its changes here and retest before integration. No fetch, push, publication,
service restart, or interaction with the user's existing game tab is required.

## Stages

0. **Plan and baseline**: record this plan, current architecture, and release
   boundaries. Establish clean feature and integration worktrees.
1. **Measurement**: optional GPU timestamp profiler with asynchronous bounded
   readback, CPU/subsystem timing, simulation/wall-time ratio, and deterministic
   browser benchmark scenes. Test open flow, congestion, obstacle-heavy terrain,
   combat, aftermath, and long runs; record actual sustained populations, timing
   distributions, invalid values, errors, adapter and resolution. Provide
   subsystem switches for controlled attribution and an unsupported-query path.
2. **Terrain broad phase**: cache conservative per-cell obstacle candidates;
   replace repeated all-obstacle physics scans while retaining exact narrow-phase
   calculations, obstacle ordering, telemetry indices and swept-motion coverage.
   Validate thin walls, corners, long walls, dynamic edits, and reference parity.
3. **Combat and CPU preparation**: spatially restrict acquisition/chain searches
   and active attack work where profiling justifies it; preserve target ordering,
   generation validation and ownership. Cache stable definitions, terrain data,
   and uploads. Record before/after and regression checks.
4. **Rendering and effects**: compact active/visible effect work, reduce settled
   blood/corpse cost, avoid repeated animation work at unchanged simulation time,
   and add bounded render-resolution controls independent of UI resolution.
   Validate effect visibility, layering, persistence and independent game state.
5. **Scalable crowd prototype**: implement an explicit experimental shared-grid
   density/velocity/pressure mode with bounded local separation. Keep the exact
   solver as reference. Measure sparse, dense, obstacle, blast and mixed-size
   behavior. Document a retain/promote/reject decision; an approximation that
   fails gameplay invariants must not silently become the default.
6. **Adaptive budgets**: use measured cost/local density to select validated
   quality levels with hysteresis. Prefer cosmetic/resolution budgets first;
   enable approximate simulation only where stage 5 establishes acceptable
   behavior. Do not change damage, spawn quotas, money, or firing rate to hide
   frame drops. Evaluate reduced-rate steering separately from collision dt.
7. **Final regression and handoff**: run full tests/build, browser GPU checks,
   sustained benchmarks and quality comparisons. Record measured gains and
   limitations, final settings, remaining research choices, commit history, and
   confirmation that all completed work is in dev and stable is unchanged.

## Benchmark and acceptance protocol

- Use feature Vite on 5174 or another free non-5173 port; dedicated automation tab.
- Fixed seeds, maps, populations, warmup and measurement windows. Record sample
  counts and timing method. Short GPU-batched throughput tests are distinct from
  presented frame timing. Do not call CPU encode time GPU time.
- Compare one change at a time against the same scenario. GPU pass timestamps
  are attribution aids, not substitutes for end-to-end timing.
- Keep the user's live game running. Record concurrent GPU workload as a source
  of variance; do not claim uncontended hardware capacity from these samples.
- Counters: actual live and slot count, density/neighbor work where available,
  obstacle candidates, draw counts, errors and simulation seconds/wall second.
- Gameplay: finite values, no tunneling, correct rewards/ownership, continuous
  spawning, wall contact/crushing, target validity, and comparable throughput.
- Approximate-mode acceptance: bounded search, stable dense behavior, retained
  conservation/accounting, explicit differences and measured speed benefit.
- Tests/build must pass before each integration; GPU changes also require a
  browser execution check. Do not broaden tests repeatedly without new concerns.

## Progress

- Stage 0: plan established; dev includes unreleased permanent fences and terrain
  changes, so all new measurements use dev rather than assuming published parity.
- Stage 1: optional bounded GPU profiler, production simulation/wall ratio and
  opt-in profiling, deterministic five-scenario browser laboratory, and raw
  baseline evidence implemented. Apple timestamp support verified with no GPU
  errors; targeting, not density, dominates this initial mixed-tower fixture.
- Stage 2: conservative indexed terrain queries and cached uploads implemented.
  Retained the original exact narrow phase and an explicit full-scan reference.
  Browser parity check over 24 steps including terrain edits: maximum difference
  0, identical obstacle telemetry. Six existing GPU gameplay checks also pass;
  184 unit tests and production build pass. Initial obstacle fixture substeps
  fell from 0.262/0.197 ms medians to 0.131/0.131 ms, but concurrent load changed
  rendering costs substantially; final comparisons must run paired trials.
- Stage 3: GPU target grid for acquisition/Tesla chains, deterministic slot-order
  tie breaking, deferred line-of-sight checks, cached obstacle uploads and tower
  definitions. Full-scan reference retained. All eight weapons match reference
  particle state, counters, shot records and Tesla state byte-for-byte across
  90 ticks, focus changes, generation reuse and empty population. Eight GPU checks,
  185 unit tests and build pass. Mixed-tower target median 1.376 -> 0.197 ms in
  initial samples (not a controlled end-to-end speedup claim). Damage passes were
  below ~0.066 ms in these fixtures; active-attack restructuring is deferred unless
  the later stress matrix identifies a material cost.
- Stage 4: stable GPU prefix compaction for occupied visible blood cells and live
  droplets; exact alpha order retained. Indirect counts, persistence, wall
  attribution and reset tested in the real GPU blood suite (12 checks). Added
  bounded battlefield-resolution control and skip unchanged shambler animation
  with explicit reset invalidation. Saturated effects median completed work was
  2.9 ms compacted vs 2.8 ms reference: no proven saturated speedup. Keep reference
  comparison switches and evaluate default selection in final paired benchmarks.
  Full corpse baking/Tesla compaction are not justified by current timings; the
  existing bounded corpse rings remain. Production build and all unit tests pass.
- Stage 5: opt-in `solver=hybrid` shared area/velocity/pressure grid with bounded
  local contacts and 64/48-neighbor hysteresis implemented. Sparse parity and
  dense collision/accounting verified on GPU. Dense casualties differ materially
  (126 vs 83 in the choke check); retain experimental, do not promote to default.
  See HYBRID_CROWD.md. This decision closes the prototype stage without silently
  changing normal gameplay difficulty.
- Stage 6: presentation-only automatic resolution trials, hysteresis, slow
  recovery, and rollback of ineffective reductions; manual High/Balanced/
  Performance settings persisted independently of saves. Hidden tabs/pauses do
  not trigger adaptation. Unit tests cover reactions, rollback and manual modes.
  Browser verified backing resolution 3426x1924 -> 1713x962 with unchanged game
  epoch and zero profiler errors. 191 tests and production build pass.
  Reduced-rate steering, collision dt changes and automatic hybrid simulation
  rejected for this release because they lack demonstrated gameplay parity.
