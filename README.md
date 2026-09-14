# nyx

A local ONNX inference tool — fully local, no cloud, your data never leaves your machine.

## What it is

nyx runs transformers.js-compatible ONNX models locally:

- **Text generation** — small instruct models (e.g. Qwen2.5-0.5B-Instruct), one-shot or interactive TUI
- **Image-to-image** — super-resolution and other image transforms (e.g. 4x_APISR_GRL_GAN)
- **Master brain (agent)** — an optional remote model (bring your own API key) that orchestrates local coding tools; the agent loop runs in the local server, files/bash stay on your machine
- **CLI and desktop** — a terminal CLI plus an Electron desktop app sharing the same local model cache

## Architecture

Bun monorepo:

- `packages/config` — `~/.nyx` paths, the model registry (`~/.nyx/models.json`), and user settings (`~/.nyx/settings.json`)
- `packages/llm` — model runtime + tasks (`runtime.ts` shared loader, `tasks/*`), built on onnxruntime-node / transformers.js
- `packages/agent` — the master-brain agent core (Vercel AI SDK: providers + tool loop), no onnx dependency
- `packages/server` — Hono HTTP service under `/v1` (models / tasks/text-generation / tasks/image-to-image / agent), spawned as a plain Node child so onnxruntime runs outside Electron
- `apps/coding-agent` — terminal CLI (yargs): `nyx` (agent TUI), `nyx text-generation`, `nyx image-to-image`, `nyx model ...`
- `apps/desktop` — Electron desktop app (forge + vite + React)

## Quick start

```bash
bun install
bun run dev -- --help       # run the CLI (default command starts the agent TUI; see Master brain)
bun --cwd apps/coding-agent run src/index.ts --help
```

### Local models

Models are cached in `~/.nyx/models/` and auto-downloaded from Hugging Face on first use. Pre-download with `nyx model pull`. To download via a mirror (e.g. in restricted networks), set `HF_ENDPOINT` (e.g. `https://hf-mirror.com`) or pick a hub URL in the desktop Settings page.

## Commands

`nyx` (no subcommand) is the master-brain agent and needs a configured remote model (see below). Local task commands require an explicit `--model <id>` (any transformers.js-compatible ONNX model); `model` subcommands take the model id as a positional argument.

```bash
nyx                                                              # master-brain agent TUI (remote model + coding tools)
nyx --cwd ./project                                              # ...with an explicit workspace directory

nyx model pull <model> --task <text-generation|image-to-image>   # pre-download a model
nyx model list                                                   # list locally cached models (alias: ls)
nyx model remove <model> [--yes]                                 # delete a cached model

nyx text-generation --model "<id>" --message "Hello"             # one-shot text generation
nyx image-to-image <input> --model "<id>" [-o out.png]           # image-to-image transform
```

In the agent TUI: type a message and press Enter to send, `/clear` resets the transcript, `/quit` (or Ctrl+C) exits. Replies stream in as markdown, with tool cards and inline y/n approval prompts.

## Master brain (agent)

The default `nyx` command is an agent whose **brain is a remote model** (bring your own API key) and whose tools are local coding tools (`read_file`, `grep`, `glob`, `write_file`, `edit_file`, `bash`). Read-only tools run automatically; writes and shell commands ask for `y/n` approval. Everything runs inside a `--cwd` workspace (default: current directory).

The agent loop runs in the local server (`POST /v1/agent`), so API calls go out but files and commands stay on your machine. Configure the brain in `~/.nyx/settings.json` — `agent.model` is a `<providerId>/<modelId>` ref into the `agent.provider` map:

```json
{
  "agent": {
    "model": "deepseek/deepseek-chat",
    "provider": {
      "deepseek": {
        "npm": "@ai-sdk/openai-compatible",
        "options": {
          "baseURL": "https://api.deepseek.com/v1",
          "apiKey": "sk-..."
        },
        "limit": { "output": 4096 }
      }
    }
  }
}
```

`npm` selects the AI SDK provider package — `@ai-sdk/openai-compatible` (any OpenAI-compatible endpoint: OpenAI, DeepSeek, OpenRouter, vLLM, Ollama, OpenCode Zen/Go, …) or `@ai-sdk/anthropic`. `options` holds `baseURL`/`apiKey`/`headers`; `limit.output` caps generated tokens. Env overrides: `NYX_AGENT_MODEL` replaces the ref, and `NYX_AGENT_BASE_URL`/`NYX_AGENT_API_KEY`/`NYX_AGENT_HEADERS` (a JSON object) override the active provider's options. Per-run overrides: `--model` and `--base-url`. Some gateways need extra request headers (e.g. OpenCode Zen/Go requires `x-opencode-session`) — add them under the provider's `options.headers`. The desktop app ships the same agent as its default page: pick a workspace folder in the header, chat, and approve tool calls inline.

### Local models as tools

With `agent.tools.localModels` enabled (or `NYX_AGENT_LOCAL_MODELS=1`), the locally installed ONNX models are also exposed to the brain: `local_text_generation` runs any cached `text-generation` model and returns its text (auto-run), and `local_image_to_image` transforms an image from the workspace and writes the result back (`y/n` approval).

```json
{
  "agent": {
    "model": "deepseek/deepseek-chat",
    "provider": { "deepseek": { "npm": "@ai-sdk/openai-compatible", "options": { "baseURL": "https://api.deepseek.com/v1", "apiKey": "sk-..." } } },
    "tools": { "localModels": true }
  }
}
```

Local inference runs in-process and is not streamed — the agent's reply pauses until the tool finishes — and the tool result (generated text, or the output file path) is sent to the remote brain like any other tool output.

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
