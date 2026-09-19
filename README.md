# Fluid Tower Defense

A proposed tower-defense game where a GPU-simulated zombie crowd flows, packs, and takes damage under compression.

Current stage: research and gameplay architecture. The playable prototype is not implemented yet.

- [Technical research](RESEARCH.md): browser/native options, solver references, and performance targets.
- [Gameplay architecture](GAMEPLAY_ARCHITECTURE.md): run structure, system ownership, content definitions, combat rules, progression, and build sequence.
- [Content direction](CONTENT_DESIGN.md): example towers, upgrade branches, zombies, bosses, and bonuses.
- [Parallel development plan](PARALLEL_DEVELOPMENT_PLAN.md): agent assignments, shared interfaces, file ownership, implementation batches, and integration checks.

Agreed technical direction: begin with TypeScript, WebGPU, and WGSL; prototype a 10,000-zombie choke point with repulsion, explosions, and compression damage before expanding into the playable loop.
