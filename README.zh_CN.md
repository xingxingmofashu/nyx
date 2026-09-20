# nyx

一个可以调用本地模型的 agent：agent 模型是你自带 API key 的远程模型，工具里包含在本机运行的 ONNX 推理（图像、语音、嵌入）。

[English](README.md) | **简体中文**

## 定位

nyx 是一个编码 agent。agent 模型是远程模型（自带 API key）；工具在你的机器上运行 —— 编码工具（`read_file`、`grep`、`glob`、`write_file`、`edit_file`、`bash`），以及用于图生图、文生语音和嵌入的 ONNX 模型。文件与 shell 命令留在本地，只有 agent 的模型请求会发往外部。

## 快速开始

```bash
bun install
bun run --cwd packages/server build   # 产出 packages/server/dist/nyx-server（桌面端会 spawn 它）
bun run dev                           # 启动桌面应用
```

首次对话前先在 **Settings → Agent** 配好 agent 模型；本地 ONNX 模型在 **Local models** 页面按需拉取。

## agent 模型

**Agent** 页面是一个对话，模型是 `~/.nyx/settings.json` 里 `agent.provider` 中的远程 `<providerId>/<modelId>` 引用。`npm` 选择 AI SDK 的 provider 包 —— `@ai-sdk/openai-compatible`（OpenAI、DeepSeek、OpenRouter、vLLM、Ollama、OpenCode Zen/Go 等）或 `@ai-sdk/anthropic`；`options` 承载 `baseURL`/`apiKey`/`headers`；`limit.context`（token 数，或 `"128k"`/`"1m"`）是上下文窗口，`limit.output` 限制生成 token 数。

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

只读工具自动执行；写文件与 shell 命令在对话里等待审批。在页头选择工作区目录，在输入框以附件形式添加图片（按钮、粘贴或拖拽），并在 **Settings → Agent** 里编辑 providers、系统提示与工具开关（下一条消息即生效，无需重启）。长会话接近上下文窗口时会自动压缩；页头显示上下文用量条，并提供手动压缩按钮。

## 本地模型

模型缓存在 `~/.nyx/models/`，首次使用时自动从 Hugging Face 下载；可在 **Local models** 页面预下载。设置 `HF_ENDPOINT`（如 `https://hf-mirror.com`）或在 **Settings → Hugging Face** 填镜像地址即可走镜像，该区块也能切换离线（`huggingface.allowRemoteModels: false`；改动在 **Restart server** 后生效）。已安装的模型会作为工具暴露给 agent —— `local_image_to_image` 与 `local_text_to_speech`（都需要审批）—— 并支撑 **Image to image**、**Text to speech** 与 **Automatic speech recognition** 页面。

## 知识库

**Knowledge** 页面管理 `~/.nyx/knowledge/` 下的 Markdown，并用你从 **Local models** 安装的 ONNX 嵌入模型在本机建索引（没选模型之前不会嵌入任何内容）。在页面上导入文件或文件夹后，点 **Update index**（增量）或 **Rebuild**（换模型后用）；检索使用 [LanceDB](https://lancedb.com/) 的向量 + 关键词混合搜索。只要存在文档，agent 就会获得只读的 `search_knowledge` 工具。

## 联网搜索

agent 默认还会拿到只读的 `web_search` 与 `web_fetch` 工具。搜索走 Exa 托管后端（免 key）；可选环境变量切换 Parallel：`NYX_WEB_SEARCH_PROVIDER=exa|parallel`、`NYX_WEB_SEARCH_API_KEY`、`NYX_PARALLEL_API_KEY`。

## 开发

```bash
bun run typecheck        # 所有包类型检查
bun run lint             # 所有包 lint（oxlint）
```

架构、磁盘布局与约定见 [AGENTS.md](AGENTS.md)。
