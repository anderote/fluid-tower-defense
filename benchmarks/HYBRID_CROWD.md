# Shared-grid crowd prototype

Enable explicitly with `?solver=hybrid` in the game or performance laboratory.
Default gameplay remains `exact`; automatic graphics quality never changes this.

All live particles contribute count, occupied area and mean velocity to the
existing spatial grid. Area uses fixed point (1024 units), signed velocities use
256 units with a +/-64 clamp on the field contribution only. Particle velocity,
health, generation, collision and combat state keep their existing representation.

At 64 neighbors in the surrounding 3x3 cells a particle enters bulk mode; it
leaves below 48. Bulk density comes from normalized cell area samples, pressure
forces from a field gradient, and viscosity from average crowd velocity. Individual
contact checks visit at most eight members of each cell (72 total). Sparse mode
retains exact pair calculations; its neighborhood remains below the threshold.
Full mass contributes to pressure even when individual contacts are sampled.

The field costs are linear in population plus allocated grid cells. Dense contact
visits are bounded, but atomic contention and repeated field sampling still have
costs. Representative contacts use the existing GPU list order, so dense motion
is approximate and can vary. The grid is not a fluid incompressibility solve or
a replacement for individual health/targeting.

## Initial checks and decision

- Sparse 32-particle simulation: maximum exact/hybrid state difference 0.
- Dense 512-particle choke, 180 ticks plus push: no non-finite values, no wall
  tunneling, live + deaths conserved, exact reward accounting.
- Exact: 429 live / 83 deaths. Hybrid: 386 live / 126 deaths. This is too large
  a gameplay change to enable automatically.
- 6,000-body jam fixture: GPU substep medians 0.197 + 0.131 ms hybrid versus
  0.393 + 0.393 ms exact. Completed-work latency did not improve in these unpaired
  samples, so this is not evidence of an end-to-end speedup under normal play.

Decision: retain as an opt-in research mode, not the default or an automatic
quality fallback. Future promotion requires pressure/contact calibration,
multi-seed throughput and casualty comparisons, and demonstrated end-to-end gains.
Pure continuum and cohort models are deferred because they would redesign combat
identity and damage attribution; this prototype preserves those invariants.
