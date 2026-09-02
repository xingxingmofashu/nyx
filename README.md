# nyx

A local ONNX inference tool — fully local, no cloud, your data never leaves your machine.

## What it is

nyx runs ONNX models locally via transformers.js:

- **Text generation** — small ONNX instruct model (Qwen2.5-0.5B-Instruct), streamed one-shot prompt or interactive TUI
- **Image-to-image** — super-resolution and other image transforms (4x_APISR_GRL_GAN by default)
- **Minimal core** — a single Agent for one-shot chat; no sessions or tools yet

## Architecture

bun monorepo:

- `packages/llm` — model runtime + tasks (`runtime.ts` shared loader, `tasks/text-generation.ts`, `tasks/image-to-image.ts`), built on onnxruntime-node / transformers.js
- `packages/core` — minimal Agent (one-shot local chat)
- `apps/cli` — terminal CLI (yargs): `nyx` (interactive TUI), `nyx text-generation`, `nyx image-to-image`

## Quick start

```bash
bun install
bun run --filter='@nyx/coding-agent' -- src/index.ts --help
```

### Local models

Models are cached in `~/.nyx/models/` and auto-downloaded from Hugging Face on first use. Use `nyx pull` to pre-download.

## Commands

Every model command takes an explicit `--model <id>` (any transformers.js-compatible ONNX model).

```bash
nyx pull <model> --task text-generation   # pre-download a text-generation model
nyx pull <model> --task image-to-image    # pre-download an image-to-image model

nyx --model "<id>"                         # interactive chat TUI (requires a terminal)
nyx text-generation --model "<id>" --message "Hello"     # one-shot text generation
nyx image-to-image <input> --model "<id>" -o out.png     # image-to-image transform
```

In the chat TUI: type a message and press Enter to send, `/clear` resets the transcript, `/quit` (or Ctrl+C) exits. Replies stream in as markdown.

## Development

```bash
bun run typecheck        # type-check all packages
```
