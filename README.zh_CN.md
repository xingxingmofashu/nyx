# nyx

本地运行 ONNX 模型的推理工具 —— 纯本地，无云端，数据不出本机。

## 定位

nyx 通过 transformers.js 本地运行兼容的 ONNX 模型：

- **图生图**：超分等图像变换（如 4x_APISR_GRL_GAN）
- **文生语音**：语音合成（如 MMS-TTS），输出 WAV
- **主脑（agent）**：可选的远程模型（自带 API key），负责编排本地编码工具；agent 循环运行在本地 server 中，文件与命令都不出本机
- **CLI 与桌面端**：终端 CLI 与 Electron 桌面应用共享同一份本地模型缓存

## 架构

Bun monorepo：

- `packages/config` — `~/.nyx` 路径、模型注册表（`~/.nyx/models.json`）与用户设置（`~/.nyx/settings.json`）
- `packages/llm` — 模型运行时 + 任务（`runtime.ts` 共享加载器、`tasks/*`），基于 onnxruntime-node / transformers.js
- `packages/agent` — 主脑 agent 核心（Vercel AI SDK：provider 注册表 + 工具循环），不依赖 onnx
- `packages/server` — `/v1` 下的 Hono HTTP 服务（models / tasks/image-to-image / tasks/text-to-speech / tasks/automatic-speech-recognition / agent），以纯 Node 子进程方式启动，使 onnxruntime 运行在 Electron 之外
- `apps/coding-agent` — 终端 CLI（yargs）：`nyx`（agent TUI）、`nyx image-to-image`、`nyx text-to-speech`、`nyx model ...`
- `apps/desktop` — Electron 桌面应用（forge + vite + React）

## 快速开始

```bash
bun install
bun run dev -- --help       # 运行 CLI（默认命令启动 agent TUI，见「主脑」）
bun run --cwd apps/coding-agent src/index.ts --help
```

### 本地模型

模型缓存在 `~/.nyx/models/`，首次使用时自动从 Hugging Face 下载。可用 `nyx model pull` 预下载。如需通过镜像下载（例如网络受限环境），设置 `HF_ENDPOINT`（如 `https://hf-mirror.com`），或在桌面端设置页选择镜像地址。

## 命令

`nyx`（无子命令）是主脑 agent，需要先配置远程模型（见下）。本地任务命令需显式指定 `--model <id>`（任意 transformers.js 兼容的 ONNX 模型）；`model` 子命令以位置参数传入模型 id。

```bash
nyx                                                              # 主脑 agent TUI（远程模型 + 本地编码工具）
nyx --cwd ./project                                              # ...指定工作区目录

nyx model pull <model> --task <image-to-image|text-to-speech|automatic-speech-recognition>   # 预下载模型
nyx model list                                                   # 列出本地已缓存模型（别名：ls）
nyx model remove <model> [--yes]                                 # 删除已缓存模型

nyx image-to-image <input> --model "<id>" [-o out.png]           # 图生图变换
nyx text-to-speech "<文本>" --model "<id>" [-o out.wav]          # 文生语音合成
```

agent TUI（由 `@ai-sdk/tui` 提供界面）：输入消息回车发送，内联工具审批用 `y`/`n` 回答，`Esc`（或 Ctrl+C）退出。回复以 markdown 流式显示，工具卡片与推理内容内联展示。

### 语音输入（桌面端）

在 **Manage models** 里拉取一个自动语音识别模型（如 `Xenova/whisper-base`），然后在 agent 输入框点麦克风（转录文本会自动发给 agent），或打开 **Automatic speech recognition** 页面录音并复制转录文本。音频以 16 kHz 单声道在本地转录，语言自动检测。

## 主脑（agent）

默认的 `nyx` 命令是一个 agent：**主脑是远程模型**（自带 API key），工具是本地编码工具（`read_file`、`grep`、`glob`、`write_file`、`edit_file`、`bash`）。只读工具自动执行；写文件与 shell 命令需要 `y/n` 审批。所有操作限制在 `--cwd` 工作区内（默认当前目录）。

agent 循环运行在本地 server（`POST /v1/agent`）：只对外发出模型请求，文件与命令都不出本机。在 `~/.nyx/settings.json` 中配置主脑 —— `agent.model` 是指向 `agent.provider` 的 `<providerId>/<modelId>` 引用：

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

`npm` 选择 AI SDK 的 provider 包 —— `@ai-sdk/openai-compatible`（任意 OpenAI 兼容端点：OpenAI、DeepSeek、OpenRouter、vLLM、Ollama、OpenCode Zen/Go 等）或 `@ai-sdk/anthropic`。`options` 承载 `baseURL`/`apiKey`/`headers`；`limit.output` 限制生成 token 数。环境变量覆盖：`NYX_AGENT_MODEL` 替换引用，`NYX_AGENT_BASE_URL`/`NYX_AGENT_API_KEY`/`NYX_AGENT_HEADERS`（JSON 对象）覆盖当前 provider 的 options。单次运行覆盖：`--model`、`--base-url`。部分网关需要额外的请求头（例如 OpenCode Zen/Go 需要 `x-opencode-session`），配置在对应 provider 的 `options.headers` 下。桌面端内置同一个 agent，并作为默认页面：在顶部选择工作区目录、对话、在内联卡片里审批工具调用。

### 本地模型作为工具

开启 `agent.tools.localModels`（或 `NYX_AGENT_LOCAL_MODELS=1`）后，本机已安装的 ONNX 模型也会暴露给主脑：`local_image_to_image` 对工作区内的图片做变换并把结果写回（需要 `y/n` 审批）；`local_text_to_speech` 合成 WAV 写入工作区（需要 `y/n` 审批）。

```json
{
  "agent": {
    "model": "deepseek/deepseek-chat",
    "provider": { "deepseek": { "npm": "@ai-sdk/openai-compatible", "options": { "baseURL": "https://api.deepseek.com/v1", "apiKey": "sk-..." } } },
    "tools": { "localModels": true }
  }
}
```

本地推理在进程内执行、不做流式 —— 工具跑完前 agent 回复会停顿 —— 工具结果（输出文件路径）会像其他工具输出一样发送给远程主脑。

## 桌面应用

桌面端把推理放在独立启动的 server 子进程中（onnxruntime 在 Electron 的 Node 运行时中会崩溃）。先构建 server 产物，再启动应用：

```bash
bun run --cwd packages/server build   # 生成 packages/server/dist/server.cjs
bun run dev:desktop                   # 启动 Electron 应用
```

打包使用 `bun run --cwd apps/desktop make`。

## 开发

```bash
bun run typecheck        # 所有包类型检查
```

`bun run lint` / `bun run test` 虽存在但尚无对应包脚本；验证以 `bun run typecheck` 为准。
