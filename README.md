# nyx

A local ONNX inference tool — fully local, no cloud, your data never leaves your machine.

## What it is

nyx runs transformers.js-compatible ONNX models locally:

- **Text generation** — small instruct models (e.g. Qwen2.5-0.5B-Instruct), one-shot or interactive TUI
- **Image-to-image** — super-resolution and other image transforms (e.g. 4x_APISR_GRL_GAN)
- **CLI and desktop** — a terminal CLI plus an Electron desktop app sharing the same local model cache

## Architecture

Bun monorepo:

- `packages/config` — `~/.nyx` paths, the model registry (`~/.nyx/models.json`), and user settings (`~/.nyx/settings.json`)
- `packages/llm` — model runtime + tasks (`runtime.ts` shared loader, `tasks/*`), built on onnxruntime-node / transformers.js
- `packages/server` — Hono HTTP service under `/v1` (models / text-generation / image-to-image), spawned as a plain Node child so onnxruntime runs outside Electron
- `apps/coding-agent` — terminal CLI (yargs): `nyx` (interactive TUI), `nyx text-generation`, `nyx image-to-image`, `nyx model ...`
- `apps/desktop` — Electron desktop app (forge + vite + React)

## Quick start

```bash
bun install
bun run dev -- --help       # run the CLI (default command starts the TUI, which needs --model)
bun --cwd apps/coding-agent run src/index.ts --help
```

### Local models

Models are cached in `~/.nyx/models/` and auto-downloaded from Hugging Face on first use. Pre-download with `nyx model pull`. To download via a mirror (e.g. in restricted networks), set `HF_ENDPOINT` (e.g. `https://hf-mirror.com`) or pick a hub URL in the desktop Settings page.

## Commands

Task commands require an explicit `--model <id>` (any transformers.js-compatible ONNX model); `model` subcommands take the model id as a positional argument.

```bash
nyx model pull <model> --task <text-generation|image-to-image>   # pre-download a model
nyx model list                                                   # list locally cached models (alias: ls)
nyx model remove <model> [--yes]                                 # delete a cached model

nyx --model "<id>"                                               # interactive chat TUI (requires a terminal)
nyx text-generation --model "<id>" --message "Hello"             # one-shot text generation
nyx image-to-image <input> --model "<id>" [-o out.png]           # image-to-image transform
```

In the chat TUI: type a message and press Enter to send, `/clear` resets the transcript, `/quit` (or Ctrl+C) exits. Replies stream in as markdown.

## Desktop app

The desktop app runs inference in a spawned server child (onnxruntime crashes inside Electron's Node runtime). Build the server bundle first, then start the app:

```bash
bun --cwd packages/server run build   # emit packages/server/dist/server.cjs
bun run dev:desktop                   # start the Electron app
```

Package it with `bun --cwd apps/desktop run make`.

## Development

```bash
bun run typecheck        # type-check all packages
```

`bun run lint` / `bun run test` exist but no package defines those scripts yet; verification is `bun run typecheck`.
