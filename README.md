# nyx

A local ONNX inference tool — fully local, no cloud, your data never leaves your machine.

## What it is

nyx runs transformers.js-compatible ONNX models locally:

- **Image-to-image** — super-resolution and other image transforms (e.g. 4x_APISR_GRL_GAN)
- **Text-to-speech** — speech synthesis (e.g. MMS-TTS), WAV output
- **Master brain (agent)** — an optional remote model (bring your own API key) that orchestrates local coding tools; the agent loop runs in the local server, files/bash stay on your machine
- **Knowledge base (RAG)** — drop Markdown into `~/.nyx/knowledge/` and the agent retrieves from it with local embeddings
- **CLI and desktop** — a terminal CLI plus an Electron desktop app sharing the same local model cache

## Architecture

Bun monorepo:

- `packages/config` — `~/.nyx` paths, the model registry (`~/.nyx/models.json`), and user settings (`~/.nyx/settings.json`)
- `packages/llm` — model runtime + tasks (`runtime.ts` shared loader, `tasks/*`), built on onnxruntime-node / transformers.js
- `packages/agent` — the master-brain agent core (Vercel AI SDK: providers + tool loop), no onnx dependency
- `packages/knowledge` — local knowledge base (RAG): Markdown chunking, LanceDB hybrid search, local ONNX embeddings
- `packages/server` — Hono HTTP service under `/v1` (models / tasks / agent), compiled to a self-contained Bun binary (`nyx-server`) that the desktop and the CLI spawn as a child process
- `apps/coding-agent` — terminal CLI (yargs): `nyx` (agent TUI), `nyx image-to-image`, `nyx text-to-speech`, `nyx model ...`
- `apps/desktop` — Electron desktop app (forge + vite + React)

## Quick start

```bash
bun install
bun run dev -- --help       # run the CLI (default command starts the agent TUI; see Master brain)
bun run --cwd apps/coding-agent src/index.ts --help
```

### Local models

Models are cached in `~/.nyx/models/` and auto-downloaded from Hugging Face on first use. Pre-download with `nyx model pull`. To download via a mirror (e.g. in restricted networks), set `HF_ENDPOINT` (e.g. `https://hf-mirror.com`) or pick a hub URL in the desktop Settings page.

## Commands

`nyx` (no subcommand) is the master-brain agent and needs a configured remote model (see below). Local task commands require an explicit `--model <id>` (any transformers.js-compatible ONNX model); `model` subcommands take the model id as a positional argument.

```bash
nyx                                                              # master-brain agent TUI (remote model + coding tools)
nyx --cwd ./project                                              # ...with an explicit workspace directory
nyx --resume                                                     # pick a saved session for this workspace and continue it

nyx model pull <model> --task <image-to-image|text-to-speech|automatic-speech-recognition|feature-extraction>  # pre-download a model
nyx model list                                                   # list locally cached models (alias: ls)
nyx model remove <model> [--yes]                                 # delete a cached model

nyx image-to-image <input> --model "<id>" [-o out.png]           # image-to-image transform
nyx text-to-speech "<text>" --model "<id>" [-o out.wav]          # text-to-speech synthesis
```

In the agent TUI (powered by `@ai-sdk/tui`): type a message and press Enter to send, `y`/`n` answers the inline tool-approval prompt, and `Esc` (or Ctrl+C) exits. Replies stream in as markdown, with tool cards and reasoning sections.

Sessions are saved per workspace under `~/.nyx/sessions/<workspace>/` and shared with the desktop app. `nyx --resume` lists the sessions for the current workspace and feeds the chosen one to the model as context (the terminal UI cannot re-render past turns, so only new replies are shown).

### Voice input (desktop)

Pull an automatic-speech-recognition model (e.g. `Xenova/whisper-base`) in **Manage models**, then either use the mic in the agent composer (the transcript is sent to the agent automatically) or open the **Automatic speech recognition** page to record and copy a transcript. Audio is captured at 16 kHz mono and transcribed locally; language is auto-detected.

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

`npm` selects the AI SDK provider package — `@ai-sdk/openai-compatible` (any OpenAI-compatible endpoint: OpenAI, DeepSeek, OpenRouter, vLLM, Ollama, OpenCode Zen/Go, …) or `@ai-sdk/anthropic`. `options` holds `baseURL`/`apiKey`/`headers`; `limit.output` caps generated tokens. Env overrides: `NYX_AGENT_MODEL` replaces the ref, and `NYX_AGENT_BASE_URL`/`NYX_AGENT_API_KEY`/`NYX_AGENT_HEADERS` (a JSON object) override the active provider's options. Some gateways need extra request headers (e.g. OpenCode Zen/Go requires `x-opencode-session`) — add them under the provider's `options.headers`. The desktop app ships the same agent as its default page: pick a workspace folder in the header, chat, and approve tool calls inline.

### Local models as tools

With `agent.tools.localModels` enabled (or `NYX_AGENT_LOCAL_MODELS=1`), the locally installed ONNX models are also exposed to the brain: `local_image_to_image` transforms an image from the workspace and writes the result back (`y/n` approval), and `local_text_to_speech` synthesizes a WAV into the workspace's session folder (`y/n` approval).

```json
{
  "agent": {
    "model": "deepseek/deepseek-chat",
    "provider": { "deepseek": { "npm": "@ai-sdk/openai-compatible", "options": { "baseURL": "https://api.deepseek.com/v1", "apiKey": "sk-..." } } },
    "tools": { "localModels": true }
  }
}
```

Local inference runs in-process and is not streamed — the agent's reply pauses until the tool finishes — and the tool result (the output file path) is sent to the remote brain like any other tool output.

## Knowledge base (RAG)

Drop Markdown files anywhere under `~/.nyx/knowledge/` and nyx indexes them locally with the ONNX embedding model (`Xenova/multilingual-e5-base` by default), then answers from your own documents. Chunks are stored in [LanceDB](https://lancedb.com/) with a native full-text index; queries use hybrid (vector + keyword) search fused with reciprocal rank fusion. Everything runs on your machine.

```bash
nyx model pull Xenova/multilingual-e5-base --task feature-extraction   # one-time: download the embedding model
mkdir -p ~/.nyx/knowledge && cp ~/notes/*.md ~/.nyx/knowledge/         # drop in your Markdown
nyx                                                                    # start the agent; it indexes in the background
```

Indexing is incremental (files are skipped by content hash), runs in the background at startup, and lives in `~/.nyx/knowledge/.index/` (override the knowledge dir with `NYX_KNOWLEDGE_DIR`). If the embedding model isn't downloaded yet, indexing is skipped with a hint — it is not fetched implicitly. While any Markdown file exists, the agent gets a read-only `search_knowledge` tool so it can ground answers in your documents (set `agent.tools.knowledge: false` in `settings.json` to disable). New documents are picked up on the next launch.

## Desktop app

The desktop app runs inference in a spawned `nyx-server` child (a self-contained Bun binary — onnxruntime cannot be bundled/run inside Electron). Build the server binary first, then start the app:

```bash
bun run --cwd packages/server build   # emit packages/server/dist/nyx-server
bun run dev:desktop                   # start the Electron app
```

Package it with `bun run desktop:make`.

The Agent page keeps a chat history (sidebar **Chats**, grouped by workspace): new/switch/rename/pin/duplicate/export/delete, title search, and the last session is restored on launch. Generated WAV replies are written into the workspace's session folder and only referenced from the transcript, so sessions stay small; playback re-reads the file on demand.

## Development

```bash
bun run typecheck        # type-check all packages
```

`bun run lint` / `bun run test` exist but no package defines those scripts yet; verification is `bun run typecheck`.
