# AGENTS.md

## Project

`nyx` — a fully local ONNX inference tool, no cloud. Bun monorepo. See `README.md` (English) / `README.zh_CN.md` (Chinese) for model setup and CLI usage.

## Commands

Run everything with bun, never npm. Exact versions are pinned via the workspace `catalog` in the root `package.json` (see `bunfig.toml` `exact = true`) — add new deps as `catalog:` entries, not inline versions.

```bash
bun install
bun run typecheck            # tsc --noEmit for all @nyx/* packages
bun run dev                  # run the CLI directly (root script)
bun --cwd apps/coding-agent run src/index.ts --help
```

- `build` is an alias for `typecheck` (`tsc --noEmit`) in every package except `@nyx/server`, whose `build` also runs `vite build` to emit `dist/server.cjs` for the desktop app. No other package emits `dist/`.
- Root `lint` and `test` scripts exist but NO package defines a `lint` or `test` script, so they fail with "No packages matched the filter". Verification = `bun run typecheck`.
- `tsc` is only in `node_modules/.bin`; use the bun-script form above, not bare `tsc`.

## Architecture

Dependency direction: `@nyx/config` ← `@nyx/llm` ← `@nyx/core` ← `apps/*` (all `workspace:*`). `@nyx/server` sits alongside core, depending on `@nyx/llm`; `apps/desktop` depends only on `@nyx/config` and spawns `@nyx/server` as a child process.

- `packages/config` — paths (`~/.nyx`), model-cache directory, and zod schemas for model metadata aligned with transformers.js types (`schema.ts`).
- `packages/llm` — ONNX runtime + tasks. `src/runtime.ts` is the single shared loader (transformers.js `env.cacheDir`, memoized per `task:model` pipeline). `src/models.ts` is the shared model registry (`list`/`pull`). `src/tasks/text-generation.ts` and `src/tasks/image-to-image.ts` are thin wrappers. Exports `LLMProvider`/`LLMEvent` and dtype/task types derived from `@nyx/config`.
- `packages/core` — `Agent` class (one-shot chat, no sessions/tools). Reads a `LLMProvider` via `stream()`. Only used by the CLI/TUI today.
- `packages/server` — Hono HTTP inference service (routes under `/v1`), spawned as a plain-Node child by the desktop app. onnxruntime-node crashes inside Electron's Node runtime (SIGTRAP), so inference must live in this external process.
- `apps/coding-agent` — yargs CLI: bare `nyx` starts the interactive TUI; `nyx text-generation`, `nyx image-to-image`, and `nyx model {pull,list}` are subcommands. Command modules live in `src/cli/commands/`; `src/cli/utils/cmd.ts` is the yargs typing helper.
- `apps/desktop` — Electron shell (forge + vite + React). Talks to inference only over HTTP/SSE to the spawned server via `server-manager` + `server-client`.

## Gotchas

- Models live in `~/.nyx/models/` and are downloaded to cache lazily on first use (transformers.js `env.allowRemoteModels` defaults to `true`); use `nyx model pull <model> --task <text-generation|image-to-image>` to pre-download. Code changes don't re-trigger downloads; missing model files surface as pipeline load errors.
- Every model command requires an explicit `--model`; text-generation defaults to dtype `q4`, image-to-image to `fp32`. First load of a large model is slow; pipeline is memoized so it's loaded once per process.
- `packages/llm/src/tasks/text-generation.ts` passes messages to the transformers.js pipeline, which applies the model's chat template internally.
- Desktop dev needs the server bundle first: `bun --cwd packages/server run build` (the server-manager spawns `dist/server.cjs`).
- The interactive TUI relies on the event loop staying alive; yargs `.strict()` rejects unknown flags.
- Source files import with explicit `.ts` extensions (e.g. `../runtime.ts`) — keep this convention, it's required for bun's TS resolution here.
