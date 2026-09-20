# Development Workflow

- Keep local `main` stable and runnable. The local development server intended for normal use runs from `main`.
- Keep a local `dev` branch as the integration branch for active feature work. Do not push it unless the user explicitly asks.
- For every new feature request, create a dedicated git worktree and feature branch from local `dev` (never from `main`). Do all implementation, validation, and iteration in that worktree.
- Do not merge or commit a feature branch into `dev` merely because implementation appears complete. Continue developing in its worktree until the user explicitly says to commit all work, integrate it, or gives equivalent approval.
- When that approval is given, commit the complete feature work and integrate its branch into local `dev`. Keep `main` unchanged.
- Promote local `dev` into local `main` only when the user explicitly asks to promote or release it. Validate before promotion so `main` remains a stable server target.
