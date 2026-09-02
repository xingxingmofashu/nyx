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

- `build` is an alias for `typecheck` (`tsc --noEmit`) in every package — no emit happens, `dist/` is never produced.
- Root `lint` and `test` scripts exist but NO package defines a `lint` or `test` script, so they fail with "No packages matched the filter". Verification = `bun run typecheck`.
- `tsc` is only in `node_modules/.bin`; use the bun-script form above, not bare `tsc`.

## Architecture

Dependency direction: `@nyx/llm` ← `@nyx/core` ← `@nyx/coding-agent` (all `workspace:*`).

- `packages/llm` — ONNX runtime + tasks. `src/runtime.ts` is the single shared loader (transformers.js `env.cacheDir`, memoized per `task:model` pipeline). `src/tasks/text-generation.ts` and `src/tasks/image-to-image.ts` are thin wrappers. Also exports `LLMProvider` interface and `LLMEvent` streaming types.
- `packages/core` — `Agent` class (one-shot chat, no sessions/tools). Reads a `LLMProvider` via `stream()`.
- `apps/coding-agent` — yargs CLI (`nyx text-generation`, `nyx image-to-image`, `nyx tui`) + interactive TUI. Command modules live in `src/cli/commands/`; `src/cli/utils/cmd.ts` is the yargs typing helper.

## Gotchas

- Models live in `~/.nyx/models/` and are downloaded to cache lazily on first use (transformers.js `env.allowRemoteModels` defaults to `true`). Code changes don't re-trigger downloads; missing model files surface as pipeline load errors.
- Default text-generation model `onnx-community/Qwen2.5-0.5B-Instruct` loads with dtype `q4` (see `OnnxTextGenerationOptions`). First load of a large model is slow; pipeline is memoized so it's loaded once per process.
- `packages/llm/src/tasks/text-generation.ts` passes messages to the transformers.js pipeline, which applies the model's chat template internally.
- The interactive TUI relies on the event loop staying alive; yargs `.strict()` rejects unknown flags.
- Source files import with explicit `.ts` extensions (e.g. `../runtime.ts`) — keep this convention, it's required for bun's TS resolution here.
