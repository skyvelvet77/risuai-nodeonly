# Repository Guidelines

## Project Structure & Source of Truth
This fork is the Node-hosted RisuAI reference repo. Main code lives in `src/` with Svelte UI in `src/lib/` and business logic in `src/ts/`. Node hosting code is in `server/node/`; the future Hono path is in `server/hono/`. Static assets live in `public/`, and release helpers live in `scripts/` plus `server.sh` and `update.sh`.

Important: I checked `docs/` in this repo and it currently contains only `plans/`, not maintained contributor docs. Treat `README.md`, `README.upstream.md`, `plugins.md`, and `package.json` scripts as the authoritative references.

## Branch Workflow
This repo has both `origin` (your fork) and `upstream` configured, but it is no longer the actively used custom deployment. Treat this folder as the upstream/reference side. Keep `main` close to upstream or release-sync state, and do day-to-day custom work in `/mnt/j/dev/Risuai-NodeOnly-custom` instead of here.

## Build, Test, and Development Commands
- `pnpm dev` starts the Vite dev server.
- `pnpm runserver` starts the Node server entrypoint in `server/node/server.cjs`.
- `pnpm build` creates the production web build.
- `pnpm check` runs `svelte-check` against `tsconfig.json`.
- `pnpm test` runs Vitest.
- `pnpm hono:build` builds the web app and post-processes the Hono server bundle.

## Coding Style & Naming Conventions
Use Svelte 5 and TypeScript patterns already present in the repo. Keep filenames camelCase, use `.svelte` for components and `.svelte.ts` where rune-based state is already in use, and preserve the NodeOnly assumption that storage, proxying, and assets are server-driven rather than browser-local. Avoid editing `dist/` by hand unless a release workflow explicitly requires it.

## Testing Guidelines
Run `pnpm check` and the narrowest relevant `pnpm test` scope before broad changes. If you touch `src/ts/globalApi.svelte.ts`, `src/ts/storage/nodeStorage.ts`, or plugin bridge logic under `src/ts/plugins/`, add or update regression coverage close to the changed code instead of relying on manual Safari retesting alone.

## Commit & PR Guidelines
Recent history uses short prefixes such as `feat:`, `fix:`, `docs:`, `chore:`, and occasional merge commits. Keep that style. PRs should explain the NodeOnly-specific behavior change, list verification commands, and call out any divergence from upstream `RisuAI` so future ports stay manageable. Do not push custom changes straight to `upstream`, and avoid using this repo as the primary place for active user-facing customization.
