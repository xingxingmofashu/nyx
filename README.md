# nyx

An agent that can call local models: its agent model is a remote model you bring your own key for, and its tools include ONNX inference — images, speech, and embeddings — running on your machine.

## What it is

nyx is a coding agent. The agent model is a remote model you bring your own key for; the tools run locally and include both coding tools (read/write/edit/bash) and ONNX models. Inference for images, speech, and embeddings happens on your machine, files and shell commands stay local, and only the agent's model calls go out:

- **Image-to-image** — super-resolution and other image transforms (e.g. 4x_APISR_GRL_GAN)
- **Text-to-speech** — speech synthesis (e.g. MMS-TTS), WAV output
- **Agent model** — a remote model (bring your own API key) that orchestrates local coding tools; the agent loop runs in the local server, files/bash stay on your machine
- **Knowledge base (RAG)** — drop Markdown into `~/.nyx/knowledge/` and the agent retrieves from it with local embeddings
- **Desktop app** — an Electron app over a local `nyx-server` child process that owns inference, the agent loop, sessions, and the knowledge base

## Architecture

Bun monorepo:

- `packages/global` — the on-disk layout and stores (`~/.nyx` paths, the model registry, and user settings), consumed server-side as a single `Global` namespace (`Bun.file` / `Bun.write` / `fs-extra`); the desktop reaches it only over `/v1`
- `packages/llm` — model runtime + tasks (`runtime.ts` shared loader, `tasks/*`), built on onnxruntime-node / transformers.js
- `packages/agent` — the agent, a single `Agent` namespace: `loop.ts` is the provider-agnostic agent loop (Vercel AI SDK), `provider.ts` is the `Provider` layer (agent model resolution + local ONNX provider cache), `tools/*` is one class per tool, and the concrete services sit under `Agent.Services` (agent / knowledge / models / image / speech)
- `packages/knowledge` — local knowledge base (RAG): Markdown chunking, LanceDB hybrid search, local ONNX embeddings
- `packages/server` — Hono HTTP transport under `/v1` (models / tasks / agent / knowledge) over `@nyx/agent`, compiled to a self-contained Bun binary (`nyx-server`) that the desktop spawns as a child process; the wire types live in the `Agent` namespace and the desktop imports them type-only
- `apps/desktop` — Electron desktop app (forge + vite + React): the front end, talking to the spawned server over authenticated HTTP

## Quick start

```bash
bun install
bun run --cwd packages/server build   # emit packages/server/dist/nyx-server (the desktop spawns it)
bun run dev                           # start the desktop app
```

Configure the agent model in **Settings → Agent** before the first chat; local ONNX models are pulled on demand from **Local models**.

### Local models

Models are cached in `~/.nyx/models/` (change it with `huggingface.cacheDir` in `settings.json`) and auto-downloaded from Hugging Face on first use. Pre-download them on the **Local models** page. To download via a mirror (e.g. in restricted networks), set `HF_ENDPOINT` (e.g. `https://hf-mirror.com`) or pick a hub URL in **Settings → Hugging Face** (stored as `huggingface.remoteHost`). That section also has an offline toggle (`huggingface.allowRemoteModels: false`), which uses only the local cache and never contacts the hub.

## Pages

The sidebar is the map of the front end: **Agent** (chat, workspace picker, inline tool approvals, context meter), **Chats** (the saved sessions of that workspace), **Knowledge base**, **Image to image**, **Text to speech**, **Automatic speech recognition**, **Local models**, and **Settings** (providers, agent, Hugging Face, general).

### Voice input

Pull an automatic-speech-recognition model (e.g. `Xenova/whisper-base`) on the **Local models** page, then either use the mic in the agent composer (the transcript is sent to the agent automatically) or open the **Automatic speech recognition** page to record and copy a transcript. Audio is captured at 16 kHz mono and transcribed locally; language is auto-detected.

## Agent model

The **Agent** page is a chat whose **agent model is a remote model** (bring your own API key) and whose tools are local coding tools (`read_file`, `grep`, `glob`, `write_file`, `edit_file`, `bash`). Read-only tools run automatically; writes and shell commands wait for approval in the chat. Everything runs inside the workspace picked in the page header (until one is picked, the app's working directory).

The agent loop runs in the local server (`POST /v1/agent`), so API calls go out but files and commands stay on your machine. Configure the agent model in `~/.nyx/settings.json` — `agent.model` is a `<providerId>/<modelId>` ref into the `agent.provider` map:

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

`npm` selects the AI SDK provider package — `@ai-sdk/openai-compatible` (any OpenAI-compatible endpoint: OpenAI, DeepSeek, OpenRouter, vLLM, Ollama, OpenCode Zen/Go, …) or `@ai-sdk/anthropic`. `options` holds `baseURL`/`apiKey`/`headers`; `limit.context` is the context window (a token count, or `"128k"`/`"1m"`) and `limit.output` caps generated tokens. Some gateways need extra request headers (e.g. OpenCode Zen/Go requires `x-opencode-session`) — add them under the provider's `options.headers`. Pick a workspace folder in the Agent header, chat, and approve tool calls inline; **Settings → Agent** edits the model ref, providers, system prompt, and tool toggles (changes apply to the next message, no restart). Attach images from the composer (button, paste, or drag-and-drop) to feed local tools: each file is copied into the workspace's session folder (`~/.nyx/sessions/<workspace>/attachments/`) and the agent model receives its absolute path, which is what `local_image_to_image` takes as `inputPath` — so deleting the original file never breaks the chat.

### Long sessions (context compaction)

Every turn re-sends the whole transcript, so long sessions eventually fill the model's context window. The window comes from the provider's `limit.context` (a token count, or `"128k"`/`"1m"`), set in **Settings → Agent** (or `settings.json`). When a request would come within `compaction.buffer` tokens (default 20000) of the window, the oldest turns are summarized into a checkpoint and only a verbatim tail is kept, so the conversation keeps going instead of erroring out. The checkpoint rides on the assistant message as metadata, so it persists with the session across restarts.

```json
{
  "agent": {
    "provider": { "deepseek": { "npm": "@ai-sdk/openai-compatible", "options": { "baseURL": "https://api.deepseek.com/v1" }, "limit": { "context": "128k", "output": 4096 } } },
    "compaction": { "auto": true, "prune": true, "buffer": 20000, "keep": { "tokens": 8000 } }
  }
}
```

`compaction.auto` (default on) toggles automatic summarization, `keep.tokens` is how much recent conversation stays verbatim (default: a quarter of the usable window, clamped to 2k–15k), `buffer` is the headroom that triggers it, and `prune` (default on) clears old tool-output bodies before summarizing — it only affects what the model sees, never the saved transcript. If the window is unknown (no `limit.context`), the agent does not guess: it compacts only after the provider actually rejects a request for context overflow, then retries once. The desktop shows a context-usage meter and folds everything a checkpoint covers into its card, so the visible conversation matches what the model receives; the compact button in the Agent header summarizes the earlier turns right away (`POST /v1/agent/compact`), and the transcript is saved with the checkpoint.

### Local models as tools

The locally installed ONNX models are exposed to the agent model by default: `local_image_to_image` transforms an image from the workspace and writes the result into the workspace's session folder (`~/.nyx/sessions/<workspace>/images/`, shown inline in the desktop chat), and `local_text_to_speech` synthesizes a WAV into the same session folder's `audio/` (also shown inline) — so deleting a session deletes its generated files, and the workspace itself stays untouched. Both require approval. Tools are only added for tasks that have an installed model. Set `agent.tools.localModels: false` to disable.

```json
{
  "agent": {
    "model": "deepseek/deepseek-chat",
    "provider": { "deepseek": { "npm": "@ai-sdk/openai-compatible", "options": { "baseURL": "https://api.deepseek.com/v1", "apiKey": "sk-..." } } },
    "tools": { "localModels": false }
  }
}
```

Local inference runs in-process and is not streamed — the agent's reply pauses until the tool finishes — and the tool result (the output file path) is sent to the remote agent model like any other tool output.

### Web search

The agent also gets two read-only web tools by default: `web_search` (search the web and return clean text from the top results) and `web_fetch` (read an HTTP/HTTPS URL as markdown, text, or HTML). Neither needs approval and neither touches the workspace. Search runs against the hosted Exa MCP backend, so it works with no account or API key; `web_fetch` refuses URLs that resolve to a private address (loopback, LAN, link-local/cloud metadata).

```json
{
  "agent": {
    "tools": { "webSearch": false }
  }
}
```

Set `agent.tools.webSearch: false` to disable both tools. Optional env overrides: `NYX_WEB_SEARCH_PROVIDER=exa|parallel` selects the backend (default `exa`), `NYX_WEB_SEARCH_API_KEY` is the Exa key (sent as `exaApiKey`), and `NYX_PARALLEL_API_KEY` is a Parallel bearer token. With no keys set, both backends use their keyless free tier.

## Knowledge base (RAG)

The **Knowledge** page manages the Markdown under `~/.nyx/knowledge/` and indexes it locally with an ONNX embedding model you pick on the page (there is no built-in default: until one is selected and installed, indexing and search stay off), so the agent can answer from your own documents. Import files or a whole folder on the page, or drop them in by hand:

```bash
cp ~/notes/*.md ~/.nyx/knowledge/     # hand-dropped files show up as "not indexed yet"
```

Chunks are stored in [LanceDB](https://lancedb.com/) with a native full-text index; queries use hybrid (vector + keyword) search fused with reciprocal rank fusion. Everything runs on your machine.

Indexing is incremental (files are skipped by content hash) and lives in `~/.nyx/knowledge/.index/`. It never runs on its own — not at startup and not on a query — so opening the app costs nothing: build or refresh it from the desktop's **Knowledge** page (`Update index` / `Rebuild`). If the embedding model isn't downloaded yet, indexing stops with a hint — download it once from **Local models** (task `feature-extraction`). While any Markdown file exists, the agent gets a read-only `search_knowledge` tool so it can ground answers in your documents (set `agent.tools.knowledge: false` in `settings.json` to disable).

The desktop's **Knowledge** page manages the same base: documents appear as a file tree with a status dot each (green: in the vector store, amber: being embedded right now, grey: still to build), the selected one renders as Markdown, and you can import files or a whole folder into a target folder inside the knowledge dir — picked from a tree of the existing folders (root by default), an existing path is only replaced after you confirm, delete a document (right-click), pick the local embedding model in the toolbar (the installed `feature-extraction` models; nothing is embedded until one is selected), run **Update index** to embed what changed, or **Rebuild** to drop the index and embed everything again — which is needed after switching the model. A retrieval box at the bottom runs the same hybrid search the agent's tool uses. Files dropped into `~/.nyx/knowledge/` by hand show up as "not indexed yet" and are only picked up when you press **Update index**.

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
