# nyx

An agent that can call local models: its master brain is a remote model you bring your own key for, and its tools include ONNX inference — images, speech, and embeddings — running on your machine.

## What it is

nyx is a coding agent. The master brain is a remote model you bring your own key for; the tools run locally and include both coding tools (read/write/edit/bash) and ONNX models. Inference for images, speech, and embeddings happens on your machine, files and shell commands stay local, and only the agent's model calls go out:

- **Image-to-image** — super-resolution and other image transforms (e.g. 4x_APISR_GRL_GAN)
- **Text-to-speech** — speech synthesis (e.g. MMS-TTS), WAV output
- **Master brain (agent)** — a remote model (bring your own API key) that orchestrates local coding tools; the agent loop runs in the local server, files/bash stay on your machine
- **Knowledge base (RAG)** — drop Markdown into `~/.nyx/knowledge/` and the agent retrieves from it with local embeddings
- **CLI and desktop** — a terminal CLI plus an Electron desktop app sharing the same local model cache

## Architecture

Bun monorepo:

- `packages/config` — `~/.nyx` paths, the model registry (`~/.nyx/models.json`), and user settings (`~/.nyx/settings.json`)
- `packages/llm` — model runtime + tasks (`runtime.ts` shared loader, `tasks/*`), built on onnxruntime-node / transformers.js
- `packages/agent` — the agent: `agent.ts` is the provider-agnostic master loop (Vercel AI SDK), `provider.ts` is the `Provider` layer (brain model resolution + local ONNX provider cache, exposed as `@nyx/agent/provider`), and the root entry adds the concrete capabilities (coding / model / knowledge / web tools, workspace sandbox, model/knowledge/task services)
- `packages/knowledge` — local knowledge base (RAG): Markdown chunking, LanceDB hybrid search, local ONNX embeddings
- `packages/server` — Hono HTTP transport under `/v1` (models / tasks / agent) over `@nyx/agent`, compiled to a self-contained Bun binary (`nyx-server`) that the desktop and the CLI spawn as a child process; re-exports the wire schema
- `packages/tui` — the terminal agent UI (`@ai-sdk/tui`): session transport and the spawned server lifecycle
- `apps/coding-agent` — terminal CLI (yargs): `nyx` (agent TUI), `nyx image-to-image`, `nyx text-to-speech`, `nyx model ...`
- `apps/desktop` — Electron desktop app (forge + vite + React)

## Quick start

```bash
bun install
bun run dev -- --help       # run the CLI (default command starts the agent TUI; see Master brain)
bun run --cwd apps/coding-agent src/index.ts --help
```

### Local models

Models are cached in `~/.nyx/models/` and auto-downloaded from Hugging Face on first use. Pre-download with `nyx model pull`. To download via a mirror (e.g. in restricted networks), set `HF_ENDPOINT` (e.g. `https://hf-mirror.com`) or pick a hub URL in **Settings → Hugging Face**. That section also has an offline toggle (`allowRemoteModels: false`), which uses only the local cache and never contacts the hub.

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

`npm` selects the AI SDK provider package — `@ai-sdk/openai-compatible` (any OpenAI-compatible endpoint: OpenAI, DeepSeek, OpenRouter, vLLM, Ollama, OpenCode Zen/Go, …) or `@ai-sdk/anthropic`. `options` holds `baseURL`/`apiKey`/`headers`; `limit.output` caps generated tokens. Env overrides: `NYX_AGENT_MODEL` replaces the ref, and `NYX_AGENT_BASE_URL`/`NYX_AGENT_API_KEY`/`NYX_AGENT_HEADERS` (a JSON object) override the active provider's options. Some gateways need extra request headers (e.g. OpenCode Zen/Go requires `x-opencode-session`) — add them under the provider's `options.headers`. The desktop app ships the same agent as its default page: pick a workspace folder in the header, chat, and approve tool calls inline. Its **Settings → Agent** page edits the model ref, providers, system prompt, and tool toggles (changes apply to the next message, no restart); the workspace is chosen from the Agent page header. Attach images from the composer (button, paste, or drag-and-drop) to feed local tools: each file is copied into the workspace's session folder (`~/.nyx/sessions/<workspace>/attachments/`) and the brain receives its absolute path, which is what `local_image_to_image` takes as `inputPath` — so deleting the original file never breaks the chat.

### Long sessions (context compaction)

Every turn re-sends the whole transcript, so long sessions eventually fill the model's context window. The window comes from the provider's `limit.context` (a token count, or `"128k"`/`"1m"`), or — when that is not set — from the [models.dev](https://models.dev) catalog, looked up by model id and cached under `~/.nyx/cache/models.json` (refreshed in the background; set `NYX_DISABLE_MODELS_FETCH=1` to stay offline, or `NYX_MODELS_URL` to point at a mirror). When a request would come within `compaction.buffer` tokens (default 20000) of the window, the oldest turns are summarized into a checkpoint and only a verbatim tail is kept, so the conversation keeps going instead of erroring out. The checkpoint rides on the assistant message as metadata, so it persists with the session and both the desktop and the CLI get this for free.

```json
{
  "agent": {
    "provider": { "deepseek": { "npm": "@ai-sdk/openai-compatible", "options": { "baseURL": "https://api.deepseek.com/v1" }, "limit": { "context": "128k", "output": 4096 } } },
    "compaction": { "auto": true, "prune": true, "buffer": 20000, "keep": { "tokens": 8000 } }
  }
}
```

`compaction.auto` (default on) toggles automatic summarization, `keep.tokens` is how much recent conversation stays verbatim (default: a quarter of the usable window, clamped to 2k–15k), `buffer` is the headroom that triggers it, and `prune` (default on) clears old tool-output bodies before summarizing — it only affects what the model sees, never the saved transcript. If the window is unknown (no config and no catalog entry), the agent does not guess: it compacts only after the provider actually rejects a request for context overflow, then retries once. The desktop shows a context-usage meter and folds everything a checkpoint covers into its card, so the visible conversation matches what the model receives; the compact button in the Agent header summarizes the earlier turns right away (`POST /v1/agent/compact`), and the transcript is saved with the checkpoint.

### Local models as tools

The locally installed ONNX models are exposed to the brain by default: `local_image_to_image` transforms an image from the workspace and writes the result into the workspace's session folder (`~/.nyx/sessions/<workspace>/images/`, shown inline in the desktop chat), and `local_text_to_speech` synthesizes a WAV into the same session folder's `audio/` (also shown inline) — so deleting a session deletes its generated files, and the workspace itself stays untouched. Both require approval. Tools are only added for tasks that have an installed model. Set `agent.tools.localModels: false` (or `NYX_AGENT_LOCAL_MODELS=0`) to disable.

```json
{
  "agent": {
    "model": "deepseek/deepseek-chat",
    "provider": { "deepseek": { "npm": "@ai-sdk/openai-compatible", "options": { "baseURL": "https://api.deepseek.com/v1", "apiKey": "sk-..." } } },
    "tools": { "localModels": false }
  }
}
```

Local inference runs in-process and is not streamed — the agent's reply pauses until the tool finishes — and the tool result (the output file path) is sent to the remote brain like any other tool output.

### Web search

The agent also gets two read-only web tools by default: `web_search` (search the web and return clean text from the top results) and `web_fetch` (read an HTTP/HTTPS URL as markdown, text, or HTML). Neither needs approval and neither touches the workspace. Search runs against the hosted Exa MCP backend, so it works with no account or API key; `web_fetch` refuses URLs that resolve to a private address (loopback, LAN, link-local/cloud metadata).

```json
{
  "agent": {
    "tools": { "webSearch": false }
  }
}
```

Set `agent.tools.webSearch: false` (or `NYX_AGENT_WEB_SEARCH=0`) to disable both tools. Optional env overrides: `NYX_WEB_SEARCH_PROVIDER=exa|parallel` selects the backend (default `exa`), `NYX_WEB_SEARCH_API_KEY` is the Exa key (sent as `exaApiKey`), and `NYX_PARALLEL_API_KEY` is a Parallel bearer token. With no keys set, both backends use their keyless free tier.

## Knowledge base (RAG)

Drop Markdown files anywhere under `~/.nyx/knowledge/` and nyx indexes them locally with the ONNX embedding model (`Xenova/multilingual-e5-base` by default), then answers from your own documents. Chunks are stored in [LanceDB](https://lancedb.com/) with a native full-text index; queries use hybrid (vector + keyword) search fused with reciprocal rank fusion. Everything runs on your machine.

```bash
nyx model pull Xenova/multilingual-e5-base --task feature-extraction   # one-time: download the embedding model
mkdir -p ~/.nyx/knowledge && cp ~/notes/*.md ~/.nyx/knowledge/         # drop in your Markdown
nyx                                                                    # start the agent (build the index from the Knowledge page)
```

Indexing is incremental (files are skipped by content hash) and lives in `~/.nyx/knowledge/.index/` (override the knowledge dir with `NYX_KNOWLEDGE_DIR`). It never runs on its own — not at startup and not on a query — so opening the app costs nothing: build or refresh it from the desktop's **Knowledge** page (`Update index` / `Rebuild`). If the embedding model isn't downloaded yet, indexing stops with a hint — it is not fetched implicitly. While any Markdown file exists, the agent gets a read-only `search_knowledge` tool so it can ground answers in your documents (set `agent.tools.knowledge: false` in `settings.json` to disable).

The desktop's **Knowledge** page manages the same base: documents appear as a file tree with a status dot each (green: in the vector store, amber: being embedded right now, grey: still to build), the selected one renders as Markdown, and you can import files or a whole folder (an existing path is only replaced after you confirm), delete a document (right-click), run **Update index** to embed what changed, or **Rebuild** to drop the index and embed everything again — for example after changing `knowledge.embeddingModel`. A retrieval box at the bottom runs the same hybrid search the agent's tool uses. Files dropped into `~/.nyx/knowledge/` by hand show up as "not indexed yet" and are only picked up when you press **Update index**.

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
