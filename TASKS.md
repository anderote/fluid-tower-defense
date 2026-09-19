# Implementation ledger

| Task | Owner | Status | Acceptance |
| --- | --- | --- | --- |
| P0 — contracts and GPU foundation | Lead | Build and CPU checks passed; real GPU check in progress | Local adapter, compute result, buffer layout round trip |
| PHY-1 — crowd simulation | Sol / simulation | Running in isolated worktree | Spatial neighbors, pressure, obstacles, impulse, exposure |
| VIS-1 — renderer and interface | Terra / presentation | Running in isolated worktree | Instancing, world view, controls, responsive layout |
| DATA-1 / NAV-1 / RUN-1 | Terra / gameplay | Running in isolated worktree | Definitions, flow field, waves/economy, progression checks |
| Runtime integration | Lead | In progress | Shared clock/submission and async counters |

Workers own only their assigned folders. Lead owns contracts, runtime, composition root, package dependencies, shared fixtures, and main-branch integration.
