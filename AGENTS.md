# AGENTS.md

## Project

`nyx` — a fully local ONNX inference tool (chat + embeddings), no cloud. Bun monorepo. See `README.md` (English) / `README.zh_CN.md` (Chinese) for model setup and CLI usage.

## Commands

Run everything with bun, never npm. Exact versions are pinned via the workspace `catalog` in the root `package.json` (see `bunfig.toml` `exact = true`) — add new deps as `catalog:` entries, not inline versions.

```bash
bun install
bun run typecheck            # tsc --noEmit for all @nyx/* packages
bun run --filter='@nyx/cli' start    # run the CLI directly
bun run cli -- --help        # same as above via root script
```

- `build` is an alias for `typecheck` (`tsc --noEmit`) in every package — no emit happens, `dist/` is never produced.
- Root `lint` and `test` scripts exist but NO package defines a `lint` or `test` script, so they fail with "No packages matched the filter". Verification = `bun run typecheck`.
- `tsc` is only in `node_modules/.bin`; use the bun-script form above, not bare `tsc`.

## Architecture

Dependency direction: `@nyx/llm` ← `@nyx/core` ← `@nyx/server` ← `@nyx/cli` (all `workspace:*`).

- `packages/llm` — ONNX runtime + tasks. `src/runtime.ts` is the single shared loader (transformers.js `env.cacheDir`, memoized per `task:model` pipeline). `src/tasks/chat.ts` and `src/tasks/embedding.ts` are thin wrappers. Also exports `LLMProvider` interface and `LLMEvent` streaming types.
- `packages/core` — `Agent` class (one-shot chat, no sessions/tools). Reads a `LLMProvider` via `stream()`.
- `packages/server` — Hono app on port 3848 (`127.0.0.1`), routes `/api/health`, `/api/chat`, `/api/embed`. Constructed with an `Agent` + `OnnxEmbeddingEngine`.
- `apps/cli` — yargs CLI (`nyx chat`, `nyx server`, `nyx embed`). `src/cli/utils/engine.ts` wires llm/core/server together; `src/cli/utils/cmd.ts` is the yargs typing helper.

## Gotchas

- Models live in `~/.nyx/models/` and are downloaded to cache lazily on first use (transformers.js `env.allowRemoteModels` defaults to `true`). Code changes don't re-trigger downloads; missing model files surface as pipeline load errors.
- Default chat model `onnx-community/Qwen2.5-0.5B-Instruct` loads with dtype `q4` (see `OnnxLLMOptions`). First load of a large model is slow; pipeline is memoized so it's loaded once per process.
- `packages/llm/src/tasks/chat.ts:25` hand-rolls the Qwen2.5 chat template (`<|im_start|>`); if the default model changes, this template must be updated too.
- CLI never calls `process.exit()` in `index.ts` — chat/server rely on the event loop staying alive, and yargs `.strict()` rejects unknown flags.
- Source files import with explicit `.ts` extensions (e.g. `../runtime.ts`) — keep this convention, it's required for bun's TS resolution here.
