# nyx

An agent that can call local models: its agent model is a remote model you bring your own key for, and its tools include ONNX inference — images, speech, and embeddings — running on your machine.

**English** | [简体中文](README.zh_CN.md)

## What it is

nyx is a coding agent. The agent model is remote (bring your own API key); the tools run on your machine — coding tools (`read_file`, `grep`, `glob`, `write_file`, `edit_file`, `bash`) plus ONNX models for image-to-image, text-to-speech, and embeddings. Files and shell commands stay local; only the agent's model calls go out.

## Quick start

```bash
bun install
bun run --cwd packages/server build   # emit packages/server/dist/nyx-server (spawned by the desktop)
bun run dev                           # start the desktop app
```

Configure the agent model in **Settings → Agent** before the first chat; local ONNX models are pulled on demand from **Local models**.

## Agent model

The **Agent** page is a chat whose model is a remote `<providerId>/<modelId>` ref into `agent.provider` in `~/.nyx/settings.json`. `npm` picks the AI SDK provider — `@ai-sdk/openai-compatible` (OpenAI, DeepSeek, OpenRouter, vLLM, Ollama, OpenCode Zen/Go, …) or `@ai-sdk/anthropic`; `options` holds `baseURL`/`apiKey`/`headers`; `limit.context` (a token count, or `"128k"`/`"1m"`) is the context window and `limit.output` caps generated tokens.

```json
{
  "agent": {
    "model": "deepseek/deepseek-chat",
    "provider": {
      "deepseek": {
        "npm": "@ai-sdk/openai-compatible",
        "options": { "baseURL": "https://api.deepseek.com/v1", "apiKey": "sk-..." }
      }
    }
  }
}
```

Read-only tools run automatically; writes and shell commands wait for approval in the chat. Pick a workspace folder in the header, attach images from the composer (button, paste, or drag-and-drop), and edit providers, the system prompt and tool toggles in **Settings → Agent** (next message, no restart). Long sessions compact automatically when they approach the context window; the header shows a context meter and a manual compact button.

## Local models

Models are cached in `~/.nyx/models/` and auto-downloaded from Hugging Face on first use; pre-download them on the **Local models** page. Set `HF_ENDPOINT` (e.g. `https://hf-mirror.com`) or a hub URL in **Settings → Hugging Face** to use a mirror, where you can also go offline (`huggingface.allowRemoteModels: false`; changes apply after **Restart server**). Installed models are exposed to the agent as tools — `local_image_to_image` and `local_text_to_speech`, both needing approval — and power the **Image to image**, **Text to speech** and **Automatic speech recognition** pages.

## Knowledge base

The **Knowledge** page manages the Markdown under `~/.nyx/knowledge/` and indexes it locally with an ONNX embedding model you install from **Local models** (nothing is indexed until you pick one). Import files or a folder on the page, then **Update index** (incremental) or **Rebuild** (after switching models); retrieval uses hybrid vector + keyword search in [LanceDB](https://lancedb.com/). While documents exist, the agent gets a read-only `search_knowledge` tool.

## Web search

The agent also gets read-only `web_search` and `web_fetch` tools by default. Search uses the hosted Exa backend (keyless); optional env vars select Parallel: `NYX_WEB_SEARCH_PROVIDER=exa|parallel`, `NYX_WEB_SEARCH_API_KEY`, `NYX_PARALLEL_API_KEY`.

## Development

```bash
bun run typecheck        # type-check all packages
bun run lint             # lint all packages (oxlint)
```

Architecture, on-disk layout, and conventions live in [AGENTS.md](AGENTS.md).
