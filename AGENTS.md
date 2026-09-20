# Development Workflow

- Keep local `main` stable and runnable. The local development server intended for normal use runs from `main`.
- Keep a local `dev` branch as the integration branch for active feature work. Do not push it unless the user explicitly asks.
- Keep the repository root worktree checked out on `main` at all times: it serves the live development server. Use dedicated worktrees for `dev` and every other branch; never switch the root directory away from `main`.
- For every new feature request, create a dedicated git worktree and feature branch from local `dev` (never from `main`). Do all implementation, validation, and iteration in that worktree.
- Once requested feature work is complete and validation passes, automatically commit it and integrate its branch into local `dev`. Keep `main` unchanged unless the user explicitly asks to promote or release it.
- For crash fixes and other fixes that restore a broken or unusable experience, once validation passes, automatically promote the validated `dev` integration to local `main` so the live development server receives the repair.
- Promote local `dev` into local `main` only when the user explicitly asks to promote or release it. Validate before promotion so `main` remains a stable server target.
