# nyx

一个可以调用本地模型的 agent：agent 模型是你自带 API key 的远程模型，工具里包含在本机运行的 ONNX 推理（图像、语音、嵌入）。

## 定位

nyx 是一个编码 agent。agent 模型是你自带 API key 的远程模型；工具在本地运行，既有编码工具（read/write/edit/bash），也有 ONNX 模型。图像、语音、文本嵌入的推理在本机完成，文件与 shell 命令留在本地，只有 agent 的模型请求会发往外部：

- **图生图**：超分等图像变换（如 4x_APISR_GRL_GAN）
- **文生语音**：语音合成（如 MMS-TTS），输出 WAV
- **agent 模型**：远程模型（自带 API key），负责编排本地编码工具；agent 循环运行在本地 server 中，文件与命令都不出本机
- **知识库（RAG）**：把 Markdown 放进 `~/.nyx/knowledge/`，agent 用本地嵌入模型从你的资料中检索回答
- **桌面应用**：Electron 应用 + 本地 `nyx-server` 子进程，推理、agent 循环、会话与知识库都在本机

## 架构

Bun monorepo：

- `packages/config` — `~/.nyx` 路径、模型注册表（`~/.nyx/models.json`）与用户设置（`~/.nyx/settings.json`）
- `packages/llm` — 模型运行时 + 任务（`runtime.ts` 共享加载器、`tasks/*`），基于 onnxruntime-node / transformers.js
- `packages/agent` — agent 本体：`agent.ts` 是 provider 无关的 agent 循环（Vercel AI SDK），`provider.ts` 是 `Provider` 层（agent 模型解析 + 本地 ONNX provider 缓存），包根补充具体能力（编码 / 模型 / 知识 / 网络工具、工作区沙箱、model/knowledge/task 服务）
- `packages/knowledge` — 本地知识库（RAG）：Markdown 切分、LanceDB 混合检索、本地 ONNX 嵌入
- `packages/server` — `/v1` 下的 Hono HTTP 传输层（models / tasks / agent / knowledge），构建在 `@nyx/agent` 之上，编译为自包含的 Bun 可执行文件（`nyx-server`），由桌面端以子进程方式启动；并 re-export 线协议 schema
- `apps/desktop` — Electron 桌面应用（forge + vite + React）：唯一的前端，通过带 token 的 HTTP 与子进程 server 通信

## 快速开始

```bash
bun install
bun run --cwd packages/server build   # 产出 packages/server/dist/nyx-server（桌面端会 spawn 它）
bun run dev                           # 启动桌面应用
```

首次对话前先在 **Settings → Agent** 配好 agent 模型；本地 ONNX 模型在 **Local models** 页面按需拉取。

### 本地模型

模型缓存在 `~/.nyx/models/`（可在 `settings.json` 里设置 `huggingface.cacheDir` 更换），首次使用时自动从 Hugging Face 下载。可在 **Local models** 页面预下载。如需通过镜像下载（例如网络受限环境），设置 `HF_ENDPOINT`（如 `https://hf-mirror.com`），或在 **Settings → Hugging Face** 选择镜像地址（保存为 `huggingface.remoteHost`）。该区块还提供离线开关（`huggingface.allowRemoteModels: false`）：只用本地缓存，不再访问 hub。

## 页面

侧栏就是前端的目录：**Agent**（对话、工作区选择、内联工具审批、上下文用量表）、**Chats**（该工作区的历史会话）、**Knowledge base**、**Image to image**、**Text to speech**、**Automatic speech recognition**、**Local models**，以及 **Settings**（providers、agent、Hugging Face、通用）。

### 语音输入

在 **Local models** 页面拉取自动语音识别模型（如 `Xenova/whisper-base`），然后在 agent 输入框点麦克风（转录文本会自动发给 agent），或打开 **Automatic speech recognition** 页面录音并复制转录文本。音频以 16 kHz 单声道在本地转录，语言自动检测。

## agent 模型

**Agent** 页面是一个对话：**agent 模型是远程模型**（自带 API key），工具是本地编码工具（`read_file`、`grep`、`glob`、`write_file`、`edit_file`、`bash`）。只读工具自动执行；写文件与 shell 命令在对话里等待审批。所有操作限制在页面顶部选择的工作区内（未选择目录前无法发送消息）。

agent 循环运行在本地 server（`POST /v1/agent`）：只对外发出模型请求，文件与命令都不出本机。在 `~/.nyx/settings.json` 中配置 agent 模型 —— `agent.model` 是指向 `agent.provider` 的 `<providerId>/<modelId>` 引用：

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

`npm` 选择 AI SDK 的 provider 包 —— `@ai-sdk/openai-compatible`（任意 OpenAI 兼容端点：OpenAI、DeepSeek、OpenRouter、vLLM、Ollama、OpenCode Zen/Go 等）或 `@ai-sdk/anthropic`。`options` 承载 `baseURL`/`apiKey`/`headers`；`limit.output` 限制生成 token 数。环境变量覆盖：`NYX_AGENT_MODEL` 替换引用，`NYX_AGENT_BASE_URL`/`NYX_AGENT_API_KEY`/`NYX_AGENT_HEADERS`（JSON 对象）覆盖当前 provider 的 options。部分网关需要额外的请求头（例如 OpenCode Zen/Go 需要 `x-opencode-session`），配置在对应 provider 的 `options.headers` 下。在 Agent 页顶部选择工作区目录、对话、在内联卡片里审批工具调用；**Settings → Agent** 页面可编辑模型引用、providers、系统提示与工具开关（下一条消息即生效，无需重启）。在输入框可以附件形式添加图片（按钮、粘贴或拖拽）：每个文件会被复制到该工作区的会话目录（`~/.nyx/sessions/<workspace>/attachments/`），agent 模型拿到的是它的绝对路径，也就是 `local_image_to_image` 所需的 `inputPath` —— 因此删掉原始文件也不会让对话失效。

### 长会话（上下文压缩）

每一轮都会把整份 transcript 重新发给模型，所以长会话最终会占满模型的上下文窗口。窗口大小取自 provider 的 `limit.context`（token 数，或 `"128k"`/`"1m"`）；没配时回退到 [models.dev](https://models.dev) 目录，按模型 id 查找并缓存到 `~/.nyx/cache/models.json`（后台刷新；设 `NYX_DISABLE_MODELS_FETCH=1` 可离线，`NYX_MODELS_URL` 可指向镜像）。当一次请求距离窗口只剩 `compaction.buffer`（默认 20000）token 时，最旧的若干轮会被总结成一个 checkpoint，只保留一段原文的尾部，于是对话能继续而不是直接报错。checkpoint 挂在 assistant 消息的 metadata 上，因此随会话持久化，重启应用依然有效。

```json
{
  "agent": {
    "provider": { "deepseek": { "npm": "@ai-sdk/openai-compatible", "options": { "baseURL": "https://api.deepseek.com/v1" }, "limit": { "context": "128k", "output": 4096 } } },
    "compaction": { "auto": true, "prune": true, "buffer": 20000, "keep": { "tokens": 8000 } }
  }
}
```

`compaction.auto`（默认开）控制是否自动总结，`keep.tokens` 是保留多少最近的原文（默认：可用窗口的四分之一，钳制在 2k–15k），`buffer` 是触发压缩的余量，`prune`（默认开）在总结前清掉旧工具输出的正文 —— 只影响模型看到的内容，绝不改动已保存的 transcript。如果窗口未知（既没配置也没有目录条目），agent 不会瞎猜：只有当 provider 真的因上下文溢出拒绝请求时，才压缩并重试一次。桌面端在对话里显示上下文用量条，并把 checkpoint 覆盖的历史折叠进压缩卡片，让可见的对话和模型真正收到的内容一致；Agent 页头部的压缩按钮会立即把之前的轮次总结成一个 checkpoint（`POST /v1/agent/compact`），并连同 checkpoint 一起保存会话。

### 本地模型作为工具

默认情况下，本机已安装的 ONNX 模型就会暴露给 agent 模型：`local_image_to_image` 对工作区内的图片做变换，结果写入该工作区的会话目录（`~/.nyx/sessions/<workspace>/images/`，桌面端会内联展示）；`local_text_to_speech` 合成的 WAV 写入同一会话目录的 `audio/`（同样内联展示）——这样删除会话就会一并删掉生成的文件，工作区本身保持干净。两者都需要审批。只有装了对应任务模型时才会添加相应工具。设 `agent.tools.localModels: false`（或 `NYX_AGENT_LOCAL_MODELS=0`）可关闭。

```json
{
  "agent": {
    "model": "deepseek/deepseek-chat",
    "provider": { "deepseek": { "npm": "@ai-sdk/openai-compatible", "options": { "baseURL": "https://api.deepseek.com/v1", "apiKey": "sk-..." } } },
    "tools": { "localModels": false }
  }
}
```

本地推理在进程内执行、不做流式 —— 工具跑完前 agent 回复会停顿 —— 工具结果（输出文件路径）会像其他工具输出一样发送给远程 agent 模型。

### 联网搜索

agent 默认还会拿到两个只读网页工具：`web_search`（联网搜索并返回靠前结果的干净正文）和 `web_fetch`（把 HTTP/HTTPS 链接读成 markdown、纯文本或 HTML）。两者都不需要审批，也不会改动工作区。搜索走 Exa 的托管 MCP 后端，无需账号或 API key 即可使用；`web_fetch` 会拒绝解析到内网地址（回环、局域网、链路本地/云元数据）的链接。

```json
{
  "agent": {
    "tools": { "webSearch": false }
  }
}
```

设 `agent.tools.webSearch: false`（或 `NYX_AGENT_WEB_SEARCH=0`）可关闭两个工具。可选环境变量：`NYX_WEB_SEARCH_PROVIDER=exa|parallel` 选择后端（默认 `exa`），`NYX_WEB_SEARCH_API_KEY` 是 Exa 的 key（以 `exaApiKey` 传入），`NYX_PARALLEL_API_KEY` 是 Parallel 的 bearer token。都不设置时，两个后端都使用免 key 的免费额度。

## 知识库（RAG）

**Knowledge** 页面管理 `~/.nyx/knowledge/` 下的 Markdown，并用你在页面上选择的本地 ONNX 嵌入模型在本机建索引（没有内置默认模型：没选或没下载之前，索引与检索都不工作），agent 便能基于你自己的文档回答。可以在页面上导入文件或整个文件夹，也可以直接放进去：

```bash
cp ~/notes/*.md ~/.nyx/knowledge/     # 手动放入的文件会显示为「待索引」
```

片段存在 [LanceDB](https://lancedb.com/) 中并建立原生全文索引；查询使用向量 + 关键词的混合检索，并以 RRF 融合排序。全程在本机运行。

索引是增量的（按内容哈希跳过未变文件），存放在 `~/.nyx/knowledge/.index/`。它不会自己跑——启动时不会，检索时也不会——所以打开应用没有额外开销：需要时在桌面端 **Knowledge** 页面点 `Update index` / `Rebuild`。若嵌入模型尚未下载，索引会停下并给出提示，不会自动下载——去 **Local models** 页面用 `feature-extraction` 任务下载一次即可。只要存在 Markdown 文件，agent 就会获得只读的 `search_knowledge` 工具，从而基于你的文档回答（在 `settings.json` 中设 `agent.tools.knowledge: false` 可关闭）。

桌面端的 **Knowledge** 页面管理同一个知识库：文档以文件树展示并带一个状态圆点（绿色：已在向量库；琥珀：正在嵌入；灰色：还没建），选中后直接预览 Markdown；可以把文件或整个文件夹导入到知识库里的指定目录（从已有目录树里选，默认根目录；同名文件只在确认后才覆盖）、右键删除文档、在工具栏里选择本地嵌入模型（本地已安装的 `feature-extraction` 模型；没选之前不会嵌入任何内容）、点 **Update index** 只嵌入变更部分，或点 **Rebuild** 丢弃索引并全量重嵌（换模型后必须重建）。页面底部的检索框跑的就是 agent 那个工具用的同一套混合检索。手动放进 `~/.nyx/knowledge/` 的文件会显示为灰色"待索引"，点 **Update index** 即被收录。

## 桌面应用

桌面端把推理放在独立启动的 `nyx-server` 子进程（自包含的 Bun 可执行文件 —— onnxruntime 无法打进 Electron / 在其中运行）。先构建 server 产物，再启动应用：

```bash
bun run --cwd packages/server build   # 生成 packages/server/dist/nyx-server
bun run dev:desktop                   # 启动 Electron 应用
```

打包使用 `bun run desktop:make`。

Agent 页面会保存对话历史（侧栏 **Chats** 分组，按工作区分组）：新建/切换/重命名/置顶/复制/导出/删除、标题搜索，并在启动时恢复上次的会话。生成的语音 WAV 写入该工作区的会话目录，会话里只引用路径，因此会话文件很小；播放时按需重新读取该文件。

## 开发

```bash
bun run typecheck        # 所有包类型检查
bun run lint             # 所有包 lint（oxlint）
```

类型检查与 lint 都必须通过。
