# AGENTS.md

Bun workspace monorepo (`bun@1.3.14`). The product and architecture are described in `README.md`.

## Commands

- `bun install`
- `bun run typecheck` — each `@nyx/*` package runs `tsc --noEmit`.
- `bun run lint` — each package runs `oxlint` (config: `.oxlintrc.json`).
- One package: `bun run --cwd packages/<name> {typecheck,lint,build}`.
- Server binary, required before desktop dev: `bun run --cwd packages/server build` → `packages/server/dist/nyx-server`.
- Desktop dev: `bun run dev`; package: `bun run desktop:make`.

## Layout

`packages/{global,llm,agent,knowledge,server}` + `apps/desktop`. Everything is consumed as raw TS (`"main"/"types": "src/index.ts"`); only `@nyx/server` builds (`bun build src/index.ts --outdir dist --packages external`, deps external, `dist/` unused internally).

- `@nyx/global` — on-disk layout and stores (`~/.nyx`), one `Global` namespace. Directory layout lives on `Path` (static getters) and `Workspace`; `Settings`/`Models`/`Session` are schema-backed. Bun-only, self-contained (`defu`, `fs-extra`, `zod`); never imported at runtime by the desktop.
- `@nyx/agent` — the agent, one `Agent` namespace: `loop.ts` (`Agent.Loop.stream`), `provider.ts`, supporting `compaction`/`workspace`/`attachment`/`session`, one class per tool under `Agent.Tools`, and services + wire schemas under `Agent.Services`. Imported at runtime only by `@nyx/server`; the desktop imports it type-only.
- `@nyx/knowledge` — LanceDB + ONNX embeddings (Markdown chunked via `MarkdownTextSplitter`, sized by `knowledge.chunkSize`/`chunkOverlap`); reachable only through `@nyx/agent`.
- `@nyx/server` — Hono HTTP layer over `@nyx/agent`, one `Server` namespace (`Server.App.create`/`serve`, sub-apps under `Server.Routes.*`).
- `apps/desktop` — Electron (forge + vite + React), talking to the spawned server over authenticated HTTP.

Helpers shared by the desktop and the server are duplicated per side (`apps/desktop/src/{preload,renderer/src}`); there is no shared package.

## Conventions

Apply to every package and the desktop.

- TypeScript with no semicolons and no comments. Relative imports carry `.ts`; Zod is always `zod/v4`.
- One concept per file; filename matches the primary export (`path.ts` → `Path`, `session.ts` → `Session`).
- `src/index.ts` is the only public entry and exports exactly one `export namespace <Name>`. Re-export each module as `export import X = xModule.X` / `export type T = xModule.T`; consumers use `import { X } from "@nyx/<pkg>"`, never `import * as`.
- Stores/services are classes; stateless operations are `static`, per-directory behaviour is an instance (`new Workspace(dir)`). Fixed paths are `private static get`ters; single-class helpers are `private static`.
- Literal constants live on the owning class as `private static readonly`; module-level `const` is reserved for exported zod schemas.
- Zod is the source of truth: `XSchema` value plus `type XSchemaType = z.infer<...>`. No duplicate hand-written types; internal persisted shapes may keep their schema private.
- IO via Bun built-ins (`Bun.file`, `Bun.write`, `Bun.JSONL`, `Bun.CryptoHasher`) and `fs-extra` (`ensureDir`, `outputJson`, `readdir`, `remove`, `appendFile`); `node:path` for joins. Non-atomic writes are fine.

## Dependencies

Versions are exact-pinned (`bunfig.toml` `install.exact = true`). The root `catalog` holds only deps shared by two or more packages (`"catalog:"`); single-package deps are pinned in that package. Never use a range.

## Architecture gotchas

- The server is a self-contained `bun build --compile` executable (`dist/nyx-server`). The desktop spawns it (`NyxServer`) and hides its stderr. Native modules (`onnxruntime-node`, `sharp`, `@lancedb/lancedb`) stay `--external` and resolve from `node_modules` (`--compile-autoload-package-json` is required). The desktop talks to it over authenticated HTTP (`Authorization: Bearer <token>`, random per launch).
- Only `@nyx/llm` and `@nyx/agent` touch onnxruntime/transformers. Desktop Vite builds keep `onnxruntime-node`, `sharp`, `@huggingface/transformers`, `electron` external. `@nyx/agent`/`@nyx/knowledge` are never imported at runtime by the desktop.
- `@nyx/server` routes use `@hono/zod-openapi` (`OpenAPIHono` + `createRoute`) so `hc` infers request/response types. `Server.Errors.hook` renders validation failures; the `App` `onError` renders `{ error }`. SSE/binary routes declare a content-less `200`. `Server.AppType` backs `hc<Server.AppType>`; wire types live in `Agent` and are type-imported by the desktop.
- `apps/desktop` uses `#components/*`, `#lib/*`, `#hooks/*`; one `tsconfig.json` covers renderer/main/preload/configs (`vite/client` + `node` + `bun`). It reaches `@nyx/global` only over the HTTP API (`/v1/settings`, `/v1/sessions`, `/v1/files`).
- Forge `packageAfterCopy` stages `nyx-server` + its native closure into `Resources/runtime/`; the packaged asar ships no `node_modules`.

## On-disk state (`~/.nyx`)

- `models/` (default; override via `settings.huggingface.cacheDir`), `models.json`, `settings.json`, `sessions/<workspaceKey>/{<id>.json, <id>.jsonl, active, audio/, images/, attachments/}`, `knowledge/**/*.md` with its index under `knowledge/.index/{config.json, manifest.json, lancedb/}`.
- Agent settings live only in `settings.json` (no env overrides). Remaining env vars: `NYX_WEB_SEARCH_PROVIDER/API_KEY`, `NYX_PARALLEL_API_KEY`, `HF_ENDPOINT`, `NYX_SERVER_TOKEN/PORT/HOST`.
- The agent model is remote: `agent.model` is `<providerId>/<modelId>` against `agent.provider`; only `@ai-sdk/openai-compatible` and `@ai-sdk/anthropic` are supported (`packages/agent/src/provider.ts`).
