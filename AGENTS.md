# AGENTS.md

Bun workspace monorepo (`bun@1.3.14`). `README.md` explains the product and architecture.

## Commands

- `bun install`
- `bun run typecheck` — the only real verification. Runs each `@nyx/*` package's `typecheck` (`tsc --noEmit`).
- Single package: `bun run --cwd packages/<name> typecheck`.
- `bun run lint` / `bun run test` are root scripts, but **no package defines `lint`/`test`** — do not claim they pass.
- CLI: `bun run dev -- --help` (runs `apps/coding-agent/src/index.ts` via yargs).
- Server binary (required before desktop dev): `bun run --cwd packages/server build` → `packages/server/dist/nyx-server` (a `bun build --compile` executable).
- Desktop dev: `bun run dev:desktop`. Package: `bun run desktop:make`.

## Workspace layout

`packages/{shared,config,llm,core,knowledge,server,tui}` and `apps/{coding-agent,desktop}`. Every package is consumed as raw TS (`"main"/"types": "src/index.ts"`); `@nyx/server` builds a compiled binary. `@nyx/shared` is the browser-safe base layer (`.`, `./chat`, `./node` subpaths: AI-SDK helpers and Node-only helpers stay out of the root); `@nyx/config` must not depend on `ai`, onnx, or LanceDB. `@nyx/core` is the provider-agnostic agent brain (AI SDK, no onnx). `@nyx/tui` is the terminal agent UI (depends on `@ai-sdk/tui`). `@nyx/knowledge` (LanceDB + ONNX embeddings) is imported only by `@nyx/server` — never by the desktop main/renderer or the CLI.

## Dependencies

Versions are exact-pinned through the root `package.json` `catalog` (with `bunfig.toml` `install.exact = true`). To add a dependency, add an exact version to `catalog` and reference `"catalog:"` in the package — never inline a range.

## Architecture gotchas

- The server is a self-contained Bun executable (`bun build --compile` → `dist/nyx-server`: server code + Bun runtime). It is spawned as a child process by both the desktop (`NyxServerProcess`) and the CLI (`startServerProcess` in `@nyx/tui`), so server output never reaches the TUI's terminal (the CLI child logs to `~/.nyx/logs/server.log`). Native modules (`onnxruntime-node`, `sharp`, `@lancedb/lancedb`) cannot be embedded — their `.node` addons `dlopen` sibling shared libraries — so they stay `--external` and resolve from `node_modules` at runtime; `--compile-autoload-package-json` is required for that resolution. The desktop talks to it over authenticated HTTP (`Authorization: Bearer <token>`, random per launch).
- Only `@nyx/llm` touches onnx/transformers. The desktop main/renderer Vite builds bundle pure TS (`@nyx/*`) and keep `onnxruntime-node`, `sharp`, `@huggingface/transformers`, `electron` external. `@nyx/knowledge` must never be imported by the desktop.
- `packages/server` routes are Hono sub-apps mounted under `/v1`; services are constructor-injected through `createApp({ services })` (see `packages/server/src/app.ts`). Request bodies are validated with `@hono/zod-validator`; `AppType` is exported type-only from `@nyx/server/api` for `hc<AppType>` on the desktop side; the wire schema lives at `@nyx/server/schema`.
- Relative imports inside TS source use explicit `.ts` extensions (`allowImportingTsExtensions`). Zod is imported as `zod/v4` everywhere in this repo.
- `apps/desktop` uses `#components/*`, `#lib/*`, `#hooks/*` import aliases; a single `tsconfig.json` covers renderer, main, preload and the forge/vite configs (`vite/client` + `node` types).
- Forge `packageAfterCopy` stages `nyx-server` + its external native closure (transformers, onnxruntime-node, sharp, LanceDB) into `Resources/runtime/`; the packaged asar ships no `node_modules`.

## On-disk state (`~/.nyx`)

- `models/` (weights, default; override `NYX_MODELS_DIR`), `models.json` (registry), `settings.json` (user/agent settings), `sessions/<workspaceKey>/{<id>.json, <id>.jsonl, active, audio/, images/, attachments/}` (metadata sidecar, transcript, last-opened id, generated clips and image transforms, user-uploaded chat attachments), `knowledge/**/*.md` (user-supplied documents) with the index under `knowledge/.index/{config.json, manifest.json, lancedb/}`, `logs/server.log` (CLI-spawned server output).
- Env overrides: `NYX_AGENT_MODEL`, `NYX_AGENT_API_KEY`, `NYX_AGENT_BASE_URL`, `NYX_AGENT_HEADERS` (JSON), `NYX_AGENT_LOCAL_MODELS`, `NYX_AGENT_WEB_SEARCH`, `NYX_WEB_SEARCH_PROVIDER/API_KEY`, `NYX_PARALLEL_API_KEY`, `HF_ENDPOINT` (HF mirror), `NYX_KNOWLEDGE_DIR`, `NYX_SERVER_TOKEN/PORT/HOST`.
- The agent brain is a remote model: `agent.model` is `<providerId>/<modelId>` resolved against `agent.provider`; only `@ai-sdk/openai-compatible` and `@ai-sdk/anthropic` are supported (`packages/core/src/provider.ts`).
