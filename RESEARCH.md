# Fluid Tower Defense — technical research

Research date: September 19, 2026.

**Recommendation:** start with a browser prototype using TypeScript, WebGPU, and WGSL compute shaders. Simulate a compressible, self-propelled crowd in two dimensions and render individual zombies using GPU instancing. Keep the simulation independent of the UI and renderer. If distributing native and browser builds becomes a firm requirement, Rust + wgpu is the strongest alternative to evaluate before building substantial platform code.

The inspected development machine is a MacBook Pro with an Apple M4 Max, 40 GPU cores, and 48 GB unified memory. No simulation benchmarks have been run. Enemy counts and frame budgets below are proposed acceptance targets, not measured performance.

## Platform options

| Approach | Fit for this game | Tradeoff |
| --- | --- | --- |
| TypeScript + WebGPU/WGSL | Recommended first prototype. Local GPU compute and rendering, easy browser delivery, direct control over simulation buffers. | Custom simulation and game systems; requires WebGPU support at runtime. |
| Rust + wgpu + WGSL | Best option to share a custom GPU core across native Metal and browser WebGPU. | More initial build, windowing, browser integration, and UI work. Native packaging is not automatic. |
| Unity + compute shaders | Strong candidate when editor tooling, 3D assets, animation, and effects become the priority. | Larger engine/build pipeline; verify the selected Unity version and actual WebGPU export features. |
| Godot + RenderingDevice compute | Good native Mac engine option with a native Metal driver. | Its documented web export uses WebGL 2; the same compute-based solver cannot currently ship through that export path. |
| Direct Metal | Maximum Apple-specific control and access to Apple GPU tooling. | Mac-specific host code and shaders; greater work to later support browsers. |

WebGPU exposes both rendering and general-purpose computation on the local device. Apple describes its mapping to Metal in [Unlock GPU computing with WebGPU](https://developer.apple.com/videos/play/wwdc2025/236/). WebKit shipped WebGPU in [Safari 26.0](https://webkit.org/blog/17333/webkit-features-in-safari-26-0/); Chrome initially shipped it on macOS in [Chrome 113](https://developer.chrome.com/blog/webgpu-release). Detect `navigator.gpu`, adapter availability, features, and device limits rather than relying on browser version alone. Serve locally on localhost during development and over HTTPS when deployed. No remote GPU is required.

[wgpu](https://wgpu.rs/) supports native Metal and browser WebGPU, with a portable graphics/compute API. Its WebGL fallback does not provide an equivalent compute path for this design. Moving a TypeScript prototype into a Rust host would involve porting orchestration and gameplay code, even if WGSL kernels and buffer layouts are retained.

Unity's Web Graphics team [announced on August 24, 2026](https://discussions.unity.com/t/webgpu-out-of-experimental-in-unity-6-6/1734694) that WebGPU is supported rather than experimental in 6000.6, including compute and VFX Graph support. WebGPU remains opt-in; the announcement is tagged 6.6-beta. This establishes backend capability, not that any selected LTS version provides it or that a WebGL fallback can run this solver.

Godot documents [native Metal support](https://docs.godotengine.org/en/4.7/engine_details/architecture/internal_rendering_architecture.html), [compute through Forward+/Mobile](https://docs.godotengine.org/en/stable/tutorials/shaders/compute_shaders.html), and [WebGL-only web export](https://docs.godotengine.org/en/stable/tutorials/export/exporting_for_web.html). This makes it attractive for a native-only implementation, with a significant browser constraint.

## What the swarm should simulate

Use an **active compressible particle crowd**: each zombie has position, velocity, health, and a desired direction. Nearby zombies exert packing pressure and damping; walls constrain movement; explosions impart impulses. Navigation continually drives the crowd toward the base, creating sustained compression at bottlenecks.

This is a proposed game model inspired by fluid and crowd research, not a validated model of biological injury. Its parameters should be tuned for readable, repeatable play.

The foundational [Continuum Crowds paper](https://grail.cs.washington.edu/projects/crowd-flows/78-treuille.pdf) combines crowd motion with continuously varying navigation fields. It is useful for shared navigation around obstacles; it does not supply a zombie crushing mechanic. For this game, navigation should tolerate congestion enough for pileups to form instead of always steering everyone away from dense regions.

| Solver | Useful properties | Implication for our mechanic |
| --- | --- | --- |
| Compressible SPH | Particle identity, local density estimates, pressure derived from density, direct per-zombie interactions. | Best simple starting point. Strong pressure and explosions demand careful timesteps and boundary treatment. |
| PBF / compliant XPBD density constraints | Position-based corrections; XPBD gives explicit compliance and constraint-force estimates. | Candidate if force-based SPH becomes unstable. Standard incompressible PBF must be adapted to allow intentional compression. |
| MLS-MPM | Transfers particle mass/momentum to a grid, solves stresses there, then transfers back. | Promising scaling alternative for very dense crowds or deformable material behavior; more implementation complexity. |
| Eulerian grid / PIC-FLIP | Shared velocity fields and particle-grid methods suit large fluid effects. | Useful for smoke or aggregate crowds, but discrete zombie identity, health, and controlled compressibility need additional design. |

The [SPH tutorial](https://interactivecomputergraphics.github.io/SPH-Tutorial/pdf/SPH_Tutorial.pdf) covers density, equations of state, neighbor search, and boundary handling. [Position Based Fluids](https://matthias-research.github.io/pages/publications/pbf_sig_preprint.pdf) targets constant-density fluids and discusses stability versus incompressibility. [XPBD](https://matthias-research.github.io/pages/publications/XPBD.pdf) introduces compliance and force estimates while addressing timestep/iteration-dependent stiffness. Simply lowering PBF iteration count would make a poor damage control because compression would depend on solver quality.

## Proposed crushing mechanic

Estimate each zombie's local density from neighboring particles using a smoothing kernel. Normalize it by a calibrated comfortable packing density. A simple candidate equation of state is:

```text
packing = local_density / rest_density
pressure = stiffness * max(packing^exponent - 1, 0)
crush_exposure += dt * max(packing - crush_threshold, 0)^damage_exponent
```

These are design equations to test, not fixed parameters. Negative pressure is omitted to avoid unwanted attraction in sparse crowds. Damage should accumulate over time above the threshold, with a separate severe-compression response if needed; single-frame numerical spikes should not determine kills. If moving to XPBD, use compliant strain and/or constraint load deliberately rather than inferring pressure solely from residual density error.

Include a short-range contact response so zombies retain a recognizable footprint. Let local density govern bulk resistance, and tune contact compliance to allow the intended packing range. Boundary correction must account for missing kernel support near walls; otherwise the place where crushing matters most can report misleading density. Convergence checks should confirm that crush outcomes remain similar when timesteps are reduced.

Dead zombies should leave the active crowd solver, relieving pressure and allowing the wave behind to advance. Use a bounded corpse/debris pool for visuals. Persistent corpse barricades could be added later as an explicit mechanic.

Useful tower experiments: a repulsor pushes zombies against walls; a mortar pushes an outer ring into the surrounding crowd; a moving crusher narrows a passage; a slowing field causes the back of a wave to pile into the front. Render density/pressure as an optional heatmap so the player and developer can see why crushing occurs.

## GPU architecture

1. CPU sends compact commands: spawn batches, tower changes, blast events, and input. CPU owns economy and wave scheduling.
2. GPU bins living particles into a uniform spatial grid using counts, prefix sums, and scatter, or an equivalent sorted cell structure.
3. Density pass gathers neighboring particles. Pressure is computed from density; the force pass combines pressure, damping, desired movement, and explosion impulses.
4. Integration resolves obstacles, updates health, and records deaths/base arrivals into compact event counters or buffers.
5. GPU draws zombies directly from the simulation buffers with instanced sprites or simple meshes. Read back small gameplay summaries asynchronously rather than every zombie's state every frame.

Use separate input/output buffers where simultaneous reads and writes could race. An in-dispatch barrier does not synchronize separate workgroups. Keep stable zombie IDs if particles are reordered.

Spatial partitioning avoids all-pairs interaction in typical distributions, but severe crowding still raises neighbor counts. Do not silently drop particles from fixed-capacity cells: the resulting density undercount would break crushing. Track occupancy and overflow, and stress-test the densest choke point. Build/rebuild neighborhood data at the appropriate substep frequency.

Use a shared navigation grid with obstacle-aware routes; refresh it on placement changes or at a lower frequency. Reject or deliberately handle fully blocked routes. Sample navigation on the GPU for each zombie rather than doing a full path search per enemy.

Start with a fixed simulation timestep and tune substeps against stiffness and peak velocity. Fast blasts require displacement limits or swept obstacle handling to prevent tunneling. Bound accumulated catch-up work after a paused/backgrounded tab.

Use 2D physical motion with top-down or isometric rendering initially. Full 3D stacking, per-zombie skeletal animation, and persistent rigid-body corpses are separate costs. Pool sparks, smoke, and debris; cap transparent overdraw and render resolution. The Mac's high-resolution display can make effects fill rate expensive even when particle physics is fast.

## Existing projects to inspect

These repositories demonstrate relevant techniques. Their published particle counts are not benchmarks for this game, and none were executed as part of this research.

| Project | Relevance | Links |
| --- | --- | --- |
| Splash | WebGPU MLS-MPM simulation. Its `million` branch advertises a 1.6-million-particle mode; useful evidence of scale experimentation, without establishing our achievable frame rate. | [Source](https://github.com/matsuoka-601/Splash), [demo](https://splash-fluid.netlify.app/) |
| Particles4All | WebGPU position-based fluid and rigid-body particles in one solver. Useful reference for physical obstacles and coupling. | [Source](https://github.com/matsuoka-601/Particles4All), [demo](https://particles4all.netlify.app/) |
| webgpu-sph | Compact SPH implementation with simulation and rendering in WebGPU. | [Source](https://github.com/MehdiSaffar/webgpu-sph), [demo](https://webgpu-sph.vercel.app/) |
| jeantimex/fluid | SPH and PIC/FLIP implementations, including 2D WebGPU and GPU spatial sorting. | [Source](https://github.com/jeantimex/fluid), [2D demo](https://jeantimex.github.io/fluid/webgpu2d.html) |

The first three repositories identify MIT licenses. Review the actual license files, attribution, and bundled asset terms before incorporating code; no third-party code has been copied into this folder.

## First prototype and decision criteria

Build one map with an open area feeding a choke point, a defended base, a repulsor, and a mortar. Include pause, single-step, enemy-count controls, compression visualization, and timing statistics.

Proposed benchmark matrix: 5,000, 10,000, 25,000, and 50,000 live zombies, both dispersed and jammed, with no blasts and with repeated simultaneous blasts. Begin at a fixed 1920×1080 render resolution, then test display scaling independently. The first target is 10,000 zombies at 60 FPS on this M4 Max, with room for the UI and effects; this is a target to validate.

Measure median and 95th-percentile frame time, GPU simulation and render time where timestamp queries are available, CPU submission time, maximum cell occupancy, invalid values, missed collisions, and crush/death counts. Run sustained tests to expose thermal behavior. Record browser/OS versions, adapter limits, render resolution, timestep, substeps, and solver settings.

Correctness scenarios: no pressure kills in a loose crowd; a stationary compressed crowd takes sustained damage; a wall-backed blast causes more compression than an open-field blast; opening a choke relieves pressure; increasing population does not lose neighbors; halving the timestep preserves broadly similar behavior. Separate direct blast damage from crush damage in the counters.

Proceed with browser delivery if the representative scene meets the budget. If not, profile whether the bottleneck is neighbor density, compute dispatch, rendering, or CPU synchronization before changing platform. Compare a small native wgpu harness using equivalent kernels when browser overhead is actually implicated. Native execution will not solve an inherently quadratic neighbor workload or excessive translucent effects.
