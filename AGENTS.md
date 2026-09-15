# AGENTS.md

Bun workspace monorepo (`bun@1.3.14`). `README.md` explains the product and architecture.

## Commands

- `bun install`
- `bun run typecheck` — the only real verification. Runs each `@nyx/*` package's `typecheck` (`tsc --noEmit`).
- Single package: `bun run --cwd packages/<name> typecheck`.
- `bun run lint` / `bun run test` are root scripts, but **no package defines `lint`/`test`** — do not claim they pass.
- CLI: `bun run dev -- --help` (runs `apps/coding-agent/src/index.ts` via yargs).
- Server bundle (required before desktop dev): `bun run --cwd packages/server build` → `packages/server/dist/server.cjs`.
- Desktop dev: `bun run dev:desktop`. Package: `bun run --cwd apps/desktop make`.

## Workspace layout

`packages/{shared,config,llm,agent,server}` and `apps/{coding-agent,desktop}`. Every package is consumed as raw TS (`"main"/"types": "src/index.ts"`); only `@nyx/server` has a real build. `@nyx/shared` is the browser-safe base layer (`.`, `./chat`, `./node` subpaths: AI-SDK helpers and Node-only helpers stay out of the root); `@nyx/config` must not depend on `ai` or onnx.

## Dependencies

Versions are exact-pinned through the root `package.json` `catalog` (with `bunfig.toml` `install.exact = true`). To add a dependency, add an exact version to `catalog` and reference `"catalog:"` in the package — never inline a range.

## Architecture gotchas

- `onnxruntime-node` crashes inside Electron's Node runtime. Inference always runs in a separate process: the desktop spawns `server.cjs` with `ELECTRON_RUN_AS_NODE=1` (its own binary as Node, no system node needed), while the CLI starts an in-process server via `start()` from `@nyx/server`. The desktop talks to it over authenticated HTTP (`Authorization: Bearer <token>`, random per launch).
- Only `@nyx/llm` touches onnx/transformers. The desktop main/renderer Vite builds bundle pure TS (`@nyx/*`) and keep `onnxruntime-node`, `sharp`, `@huggingface/transformers`, `electron` external.
- `packages/server` routes are Hono sub-apps mounted under `/v1`; services are constructor-injected through `createApp({ services })` (see `packages/server/src/app.ts`). Request bodies are validated with `@hono/zod-validator`; `AppType` is exported type-only from `@nyx/server/rpc` for `hc<AppType>` on the desktop side.
- `onnxruntime-node` crashes inside Electron's Node runtime. Inference always runs in a separate process: the desktop spawns `server.cjs` with `ELECTRON_RUN_AS_NODE=1` (its own binary as Node, no system node needed), while the CLI starts an in-process server via `start()` from `@nyx/server`. The desktop talks to it over authenticated HTTP (`Authorization: Bearer <token>`, random per launch).
- Only `@nyx/llm` touches onnx/transformers. The desktop main/renderer Vite builds bundle pure TS (`@nyx/*`) and keep `onnxruntime-node`, `sharp`, `@huggingface/transformers`, `electron` external.
- Relative imports inside TS source use explicit `.ts` extensions (`allowImportingTsExtensions`). Zod is imported as `zod/v4` everywhere in this repo.
- `apps/desktop` uses `#components/*`, `#lib/*`, `#hooks/*` import aliases; renderer and main are typechecked by separate tsconfigs (`tsconfig.json` / `tsconfig.node.json`).
- Forge `packageAfterCopy` stages `server.cjs` + its native closure into `Resources/runtime/`; the packaged asar ships no `node_modules`.

## On-disk state (`~/.nyx`)

- `models/` (weights, default; override `NYX_MODELS_DIR`), `models.json` (registry), `settings.json` (user/agent settings), `sessions/<workspaceKey>/{<id>.json, <id>.jsonl, active, audio/}` (metadata sidecar, transcript, last-opened id, generated clips).
- Env overrides: `NYX_AGENT_MODEL`, `NYX_AGENT_API_KEY`, `NYX_AGENT_BASE_URL`, `NYX_AGENT_HEADERS` (JSON), `NYX_AGENT_LOCAL_MODELS`, `HF_ENDPOINT` (HF mirror), `NYX_SERVER_TOKEN/PORT/HOST`.
- The agent brain is a remote model: `agent.model` is `<providerId>/<modelId>` resolved against `agent.provider`; only `@ai-sdk/openai-compatible` and `@ai-sdk/anthropic` are supported (`packages/agent/src/providers.ts`).
