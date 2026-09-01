# nyx

A local ONNX inference tool — fully local, no cloud, your data never leaves your machine.

## What it is

nyx runs ONNX models locally:

- **Local chat** — small ONNX model for text generation (Qwen2.5-0.5B-Instruct)
- **Local embedding** — semantic vectors and similarity (bge-small-zh-v1.5)
- **Minimal core** — a single Agent for one-shot chat; no sessions, tools, or permissions yet

## Architecture

bun monorepo:

- `packages/llm` — model runtime + tasks (`runtime.ts` shared loader, `tasks/chat.ts`, `tasks/embedding.ts`), built on onnxruntime-node / transformers.js
- `packages/core` — minimal Agent (one-shot local chat)
- `packages/server` — Hono HTTP service (health / chat / embed)
- `apps/cli` — terminal CLI (yargs)

## Quick start

```bash
bun install
bun run cli -- --help
```

### Local models

Models are cached in `~/.nyx/models/`. Two are needed:

**1. Chat model** — `onnx-community/Qwen2.5-0.5B-Instruct` (quantized, ~400MB)

```bash
mkdir -p ~/.nyx/models/onnx-community/Qwen2.5-0.5B-Instruct
cd ~/.nyx/models/onnx-community/Qwen2.5-0.5B-Instruct
# Needed: config.json, tokenizer.json, tokenizer_config.json, generation_config.json,
#         onnx/model_q4.onnx (or q8/fp16 variant)
# Download from: https://huggingface.co/onnx-community/Qwen2.5-0.5B-Instruct
```

**2. Embedding model** — `Xenova/bge-small-zh-v1.5` (512-dim zh+en, ~95MB)

```bash
mkdir -p ~/.nyx/models/Xenova/bge-small-zh-v1.5/onnx
cd ~/.nyx/models/Xenova/bge-small-zh-v1.5
for f in config.json tokenizer.json tokenizer_config.json special_tokens_map.json vocab.txt; do
  curl -L -o "$f" "https://huggingface.co/Xenova/bge-small-zh-v1.5/resolve/main/$f?download=true"
done
curl -L -o onnx/model.onnx "https://huggingface.co/Xenova/bge-small-zh-v1.5/resolve/main/onnx/model.onnx?download=true"
```

## Commands

```bash
nyx chat                              # interactive TUI (requires a terminal)
nyx chat --message "Hello"            # one-shot local chat
nyx chat --model "<id>" --message "Hello"  # chat with a specific model
nyx server                            # local HTTP server (default 3848)
nyx embed <text> [--compare <other>]  # one-shot local embedding
```

In the chat TUI: type a message and press Enter to send, `/clear` resets the transcript, `/quit` (or Ctrl+C) exits. Replies stream in as markdown.

## Server API

```bash
GET  /api/health          # health check
POST /api/chat            # { message } -> { text }  local chat
POST /api/embed           # { texts }   -> number[][] local vectors
```

## Development

```bash
bun run typecheck        # type-check all packages
```
