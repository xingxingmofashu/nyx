# AGENTS.md

Bun workspace monorepo (`bun@1.3.14`). `README.md` explains the product and architecture.

## Commands

- `bun install`
- `bun run typecheck` — the only real verification. Runs each `@nyx/*` package's `typecheck` (`tsc --noEmit`).
- Single package: `bun run --cwd packages/<name> typecheck`.
- `bun run lint` / `bun run test` are root scripts, but **no package defines `lint`/`test`** — do not claim they pass.
- Server binary (required before desktop dev): `bun run --cwd packages/server build` → `packages/server/dist/nyx-server` (a `bun build --compile` executable).
- Desktop dev: `bun run dev` (alias `bun run dev:desktop`). Package: `bun run desktop:make`.

## Workspace layout

`packages/{shared,global,llm,agent,knowledge,server}` and `apps/desktop`. Every package is consumed as raw TS (`"main"/"types": "src/index.ts"`); `@nyx/server` builds a compiled binary. `@nyx/shared` is the browser-safe base layer (`.`, `./chat`, `./node` subpaths: AI-SDK helpers and Node-only helpers stay out of the root). `@nyx/global` owns the on-disk layout and stores (`~/.nyx`: `Path`, `Workspace`, `settings`, `models`, `sessions`), exported as a single `import * as Global from "@nyx/global"` namespace; it is Bun-only (uses `Bun.file`/`Bun.write`/`Bun.JSONL`/`Bun.CryptoHasher`) and must never be imported at runtime by the desktop — the desktop reaches it only over the server HTTP API. `@nyx/agent` owns the agent: `agent.ts` is the provider-agnostic loop (AI SDK: `streamAgent`), `provider.ts` is the `Provider` layer (agent model resolution + the local ONNX provider cache), `types.ts` holds the shared types; the root entry adds the concrete capabilities (tools, workspace sandbox, model/knowledge/task services; ONNX + LanceDB). The root entry is imported only by `@nyx/server`. `@nyx/server` is the HTTP transport layer over `@nyx/agent` and re-exports the wire schema. `@nyx/knowledge` (LanceDB + ONNX embeddings) is imported only through `@nyx/agent` — never by the desktop main/renderer.

## Dependencies

Versions are exact-pinned through the root `package.json` `catalog` (with `bunfig.toml` `install.exact = true`). To add a dependency, add an exact version to `catalog` and reference `"catalog:"` in the package — never inline a range.

## Architecture gotchas

- The server is a self-contained Bun executable (`bun build --compile` → `dist/nyx-server`: server code + Bun runtime). The desktop spawns it as a child process (`NyxServerProcess`) and captures its stderr behind the app, so server output never reaches the user. Native modules (`onnxruntime-node`, `sharp`, `@lancedb/lancedb`) cannot be embedded — their `.node` addons `dlopen` sibling shared libraries — so they stay `--external` and resolve from `node_modules` at runtime; `--compile-autoload-package-json` is required for that resolution. The desktop talks to it over authenticated HTTP (`Authorization: Bearer <token>`, random per launch).
- Only `@nyx/llm` and `@nyx/agent` (the ONNX-backed tools/services) touch onnxruntime/transformers. The desktop main/renderer Vite builds bundle pure TS (`@nyx/*`) and keep `onnxruntime-node`, `sharp`, `@huggingface/transformers`, `electron` external. Neither `@nyx/agent` nor `@nyx/knowledge` may be imported by the desktop.
- `packages/server` routes are Hono sub-apps mounted under `/v1`; `createApp({ token, onLog })` (see `packages/server/src/app.ts`) builds the services from `@nyx/agent` and shares them with every route. Request bodies are validated with `@hono/zod-validator`; `AppType` is exported type-only from `@nyx/server/api` for `hc<AppType>` on the desktop side; the wire schema lives at `@nyx/agent/schema` and is re-exported as `@nyx/server/schema`.
- Relative imports inside TS source use explicit `.ts` extensions (`allowImportingTsExtensions`). Zod is imported as `zod/v4` everywhere in this repo.
- `apps/desktop` uses `#components/*`, `#lib/*`, `#hooks/*` import aliases; a single `tsconfig.json` covers renderer, main, preload and the forge/vite configs (`vite/client` + `node` + `bun` types — `bun` is needed because the desktop type-only imports the Bun-only `@nyx/global` through `@nyx/server/schema`). The desktop speaks to `@nyx/global` exclusively over the server HTTP API (`/v1/settings`, `/v1/sessions`, `/v1/files`, `/v1/environment`, `/v1/catalog`).
- Forge `packageAfterCopy` stages `nyx-server` + its external native closure (transformers, onnxruntime-node, sharp, LanceDB) into `Resources/runtime/`; the packaged asar ships no `node_modules`.

## On-disk state (`~/.nyx`)

- `models/` (weights, default; override `NYX_MODELS_DIR`), `models.json` (registry), `settings.json` (user/agent settings), `sessions/<workspaceKey>/{<id>.json, <id>.jsonl, active, audio/, images/, attachments/}` (metadata sidecar, transcript, last-opened id, generated clips and image transforms, user-uploaded chat attachments), `knowledge/**/*.md` (user-supplied documents; the desktop Knowledge page imports/previews/deletes them and drives the index) with the index under `knowledge/.index/{config.json, manifest.json, lancedb/}`, `cache/models.json` (models.dev catalog, for model context windows).
- Agent settings live only in `settings.json` (no env overrides). Remaining env vars: `NYX_WEB_SEARCH_PROVIDER/API_KEY`, `NYX_PARALLEL_API_KEY`, `NYX_MODELS_URL` (catalog source) / `NYX_DISABLE_MODELS_FETCH`, `HF_ENDPOINT` (HF mirror), `NYX_MODELS_DIR`, `NYX_KNOWLEDGE_DIR`, `NYX_SERVER_TOKEN/PORT/HOST`.
- The agent model is a remote model: `agent.model` is `<providerId>/<modelId>` resolved against `agent.provider`; only `@ai-sdk/openai-compatible` and `@ai-sdk/anthropic` are supported (`packages/agent/src/provider.ts`).
