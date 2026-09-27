# Development Workflow

- Keep local `main` stable and runnable. The local development server intended for normal use runs from `main`.
- Keep a local `dev` branch as the integration branch for active feature work. Do not push it unless the user explicitly asks.
- Keep the repository root worktree checked out on `main` at all times. Check out and manage local `dev` only from its dedicated integration worktree; never switch the root directory to `dev`.
- For every new feature request, create a dedicated git worktree and feature branch from local `dev` (never from `main`). Do all implementation, validation, and iteration in that worktree.
- Once requested feature work is complete and validation passes, automatically commit it and integrate its branch into local `dev`. Keep `main` unchanged unless the user explicitly asks to promote or release it.
- Promote local `dev` into local `main` only when the user explicitly asks to promote or release it. Validate before promotion so `main` remains a stable server target.

## Local hotspot and offline co-op

- Read `docs/PLANE-COOP.md` before changing network settings or assisting a partner with joining.
- Prepare hotspot settings without activating them; the user performs the final switch because it disconnects normal Wi-Fi and may interrupt this task. Never switch it on automatically.
- Use the scoped `scripts/mac-hotspot.sh` helper for setup/undo, preserve localhost, and do not modify unrelated services or firewall rules. The partner needs no setup script or dependency installation.
