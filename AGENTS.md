# Repository Guidelines

## Project Structure & Branch Purpose
This repo is the custom NodeOnly branch used to carry local fixes beyond upstream `Risuai-NodeOnly`, and it is the actively used user-facing deployment now. Core app code is in `src/`, hosting code is in `server/`, static assets are in `public/`, and packaging files are at the repo root. The most important branch-specific docs are in `docs/`:

- `docs/custom-branch-ios-webkit-safari-fix.md`
- `docs/upstream-issue-ios-webkit-safari-fix.md`

Read those before changing Safari, WebKit, V3 plugin bridge, or Docker publish behavior.

## Build, Test, and Development Commands
- `pnpm dev` starts the Vite app.
- `pnpm runserver` runs the Node-hosted server.
- `pnpm build` creates the production bundle.
- `pnpm check` runs `svelte-check`.
- `pnpm test` runs the Vitest suite.
- `pnpm vitest run src/ts/plugins/apiV3/tests/nodeHostedPluginBridge.regression.test.ts` verifies the custom WebKit bridge carry-forward patch.

## Coding Style & Carry-Forward Rules
Follow the existing Svelte 5 + TypeScript patterns: camelCase filenames, `.svelte` for UI, `.svelte.ts` for rune-driven state, and minimal manual edits to generated output. For this branch, preserve the custom carry-forward items documented in `docs/custom-branch-ios-webkit-safari-fix.md`: host-side WebKit fallback behavior, the targeted regression test, and any custom-image automation that keeps the branch deployable.

## Testing Guidelines
Run `pnpm check`, the targeted bridge regression test, and then `pnpm test` when touching `src/ts/plugins/apiV3/`, `src/ts/globalApi.svelte.ts`, or `src/ts/storage/nodeStorage.ts`. If a change is only safe on desktop, it is not complete for this branch; document the iPhone/Safari implication explicitly.

## Commit & PR Guidelines
History here follows `fix:`, `docs:`, `feat:`, `chore:` plus occasional upstream merges. Keep subjects short and specific. In PRs or notes, state whether a patch is:

- a custom-only carry-forward item,
- a candidate to upstream,
- or branch infrastructure such as GHCR image publishing.

This is the repo to update when the goal is to change what real users actually run in your current NodeOnly setup.
