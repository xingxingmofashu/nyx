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
- `apps/cli` — terminal CLI (yargs): `nyx text-generation`, `nyx image-to-image`, `nyx tui`

## Quick start

```bash
bun install
bun run --filter='@nyx/coding-agent' -- src/index.ts --help
```

### Local models

Models are cached in `~/.nyx/models/` and auto-downloaded from Hugging Face on first use.

**1. Text-generation model** — `onnx-community/Qwen2.5-0.5B-Instruct` (q4, ~400MB)

**2. Image-to-image model** — `Xenova/4x_APISR_GRL_GAN_generator-onnx` (fp32, 4x super-resolution)

## Commands

```bash
nyx tui                                # interactive chat TUI (requires a terminal)
nyx text-generation --message "Hello"  # one-shot text generation
nyx text-generation --model "<id>" --message "Hello"   # text generation with a specific model
nyx image-to-image <input> -o out.png  # image-to-image (default: 4x super-resolution)
nyx image-to-image <input> --model "<id>" -o out.png   # with a specific model
```

In the chat TUI: type a message and press Enter to send, `/clear` resets the transcript, `/quit` (or Ctrl+C) exits. Replies stream in as markdown.

## Development

```bash
bun run typecheck        # type-check all packages
```
