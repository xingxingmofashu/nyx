# AGENTS.md

## Project

`nyx` — a fully local ONNX inference tool, no cloud. Bun monorepo. `README.md` / `README.zh_CN.md` describe model setup and CLI usage but lag the code (they mention an `apps/cli`, `nyx pull`, etc.); trust the source tree.

## Commands

Run everything with bun, never npm. Versions are pinned via the workspace `catalog` in the root `package.json` (`bunfig.toml` `exact = true`) — add new deps as `catalog:` entries, never inline versions.

```bash
bun install
bun run typecheck             # tsc --noEmit for every @nyx/* package
bun run dev                   # run the CLI directly (root script)
bun --cwd apps/coding-agent run src/index.ts --help
bun --cwd packages/server run build   # emit dist/server.cjs for the desktop app
```

- Focused check after touching one package: `bun --cwd packages/<pkg> run typecheck`.
- `build` == `typecheck` (`tsc --noEmit`) in every package except `@nyx/server`, whose `build` also runs `vite build` to emit `dist/server.cjs`. No other package emits `dist/`.
- Root `lint`/`test` scripts exist but NO package defines a `lint` or `test` script, so they fail with "No packages matched the filter". Verification is `bun run typecheck`.
- `tsc` lives only in `node_modules/.bin`; use the bun-script forms above, never bare `tsc`. `@nyx/desktop` typecheck runs two passes (`tsconfig.json` + `tsconfig.node.json` for main/preload).
- All packages are `"type": "module"`; sources import each other with explicit `.ts` extensions (e.g. `../runtime.ts`) — required for bun's TS resolution here, keep it.

## Architecture

Dependency direction: `@nyx/config` ← `@nyx/llm` ← `@nyx/core` ← `apps/*` (all `workspace:*`). `@nyx/server` depends on `@nyx/llm`.

- `packages/config` — `~/.nyx` paths (`getModelsDir`, overridable via `NYX_MODELS_DIR`) and the model registry persisted at `~/.nyx/models.json` as `{ provider: { <org>: { models: { <name>: ModelInfo } } } }` (`read()`/`write()` with defu deep-merge). `ModelInfo.task`/`dtype` use transformers.js `PipelineType`/`DataType` directly — no zod.
- `packages/llm` — ONNX runtime + tasks. `src/runtime.ts` is the single shared loader (`configureEnv` sets `env.cacheDir` + remote/local download; `loadPipeline` memoizes per `task:model`). `src/models.ts` is the registry (`list` filters to entries still on disk, `pull` records into the config; default dtype `q4` text-generation / `fp32` image-to-image). `src/tasks/*` are provider classes, one per task: `OnnxTextGenerationProvider.stream()` (TextStreamer) and `OnnxImageToImageProvider.generate()`; both implement the shared `LLMProvider` surface (`id`/`model`/`task`). Types come from `@huggingface/transformers`, not `@nyx/config`.
- `packages/core` — pure in-memory chat-session engine: `Agent` holds a transcript (`Message[]` of discriminated `ContentBlock`s: text/thinking/image/toolCall) and streams each `prompt()` via events (`message_start`/`update`/`end`/`agent_error`). Depends only on a `TextProvider` (`@nyx/llm`). Never persists, never touches network/process — hosts serialize `agent.messages` (`messageToJson`) and seed a fresh `Agent({ history })` to resume. `systemPrompt` is separate from history. Content blocks beyond `text` have no producer yet (thinking/tool/image are type-reserved).
- `packages/server` — Hono inference service under `/v1` (models / text-generation / image-to-image). Spawned by the desktop app as a plain-`node` child: onnxruntime-node crashes inside Electron's Node runtime (SIGTRAP), so inference must live in this external process. Standalone entry `src/server.ts` reads `NYX_SERVER_TOKEN` (required — exits without it), `NYX_SERVER_PORT` (default 0 = ephemeral), `NYX_SERVER_HOST` (default 127.0.0.1), prints `nyx-server-ready <url>` on stdout. Bearer-token auth middleware when a token is set. Text-generation providers are cached per model id (weights load once per process).
- `apps/coding-agent` — yargs CLI: bare `nyx` (`$0`) is the interactive TUI; subcommands `text-generation`, `image-to-image`, and `model` (`pull` requires `--task`; `list`/`ls`). Modules in `src/cli/commands/`; `src/cli/utils/cmd.ts` is the yargs typing helper. yargs is `.strict()`, so unknown flags reject.
- `apps/desktop` — Electron shell (forge + vite + React), single instance (shared model cache). Package.json declares `@nyx/{config,core,llm,server}` but `src/` imports only `@nyx/config`; inference runs solely in the spawned server child, reached via `src/main/server/manager.ts` (ServerManager) + `client.ts` (typed SSE/HTTP client). Renderer uses path aliases `#components`/`#lib`/`#hooks` (from package.json `imports`) with shadcn/base-ui components in `src/renderer/src/components/ui/` (see `components.json`, `.claude/skills/shadcn/`).

## Gotchas

- Models cache in `~/.nyx/models/` and download lazily on first use (`allowRemoteModels`/`allowLocalModels` default on); pre-download with `nyx model pull <model> --task <text-generation|image-to-image>`. Code changes never re-trigger downloads; a missing model surfaces as a pipeline load error.
- Every model command requires an explicit `--model`; TUI also needs a TTY (`isatty` guard rejects non-interactive stdin). First load of a large model is slow — pipelines/providers are memoized per process.
- Desktop dev needs the server bundle first: `bun --cwd packages/server run build`; ServerManager resolves `packages/server/dist/server.cjs` (dev) or a packaged `resources/server.cjs`.
- text-generation passes the raw message array to the transformers.js pipeline, which applies the model's chat template internally.
- `packageManager` is pinned (`bun@1.3.14`); root `engines.node >= 20`.
