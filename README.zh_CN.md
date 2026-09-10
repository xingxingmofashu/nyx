# nyx

本地运行 ONNX 模型的推理工具 —— 纯本地，无云端，数据不出本机。

## 定位

nyx 通过 transformers.js 本地运行兼容的 ONNX 模型：

- **文本生成**：小型 instruct 模型（如 Qwen2.5-0.5B-Instruct），支持一次性提示与交互式 TUI
- **图生图**：超分等图像变换（如 4x_APISR_GRL_GAN）
- **CLI 与桌面端**：终端 CLI 与 Electron 桌面应用共享同一份本地模型缓存

## 架构

Bun monorepo：

- `packages/config` — `~/.nyx` 路径、模型注册表（`~/.nyx/models.json`）与用户设置（`~/.nyx/settings.json`）
- `packages/llm` — 模型运行时 + 任务（`runtime.ts` 共享加载器、`tasks/*`），基于 onnxruntime-node / transformers.js
- `packages/server` — `/v1` 下的 Hono HTTP 服务（models / text-generation / image-to-image），以纯 Node 子进程方式启动，使 onnxruntime 运行在 Electron 之外
- `apps/coding-agent` — 终端 CLI（yargs）：`nyx`（交互式 TUI）、`nyx text-generation`、`nyx image-to-image`、`nyx model ...`
- `apps/desktop` — Electron 桌面应用（forge + vite + React）

## 快速开始

```bash
bun install
bun run dev -- --help       # 运行 CLI（默认命令启动 TUI，需指定 --model）
bun --cwd apps/coding-agent run src/index.ts --help
```

### 本地模型

模型缓存在 `~/.nyx/models/`，首次使用时自动从 Hugging Face 下载。可用 `nyx model pull` 预下载。如需通过镜像下载（例如网络受限环境），设置 `HF_ENDPOINT`（如 `https://hf-mirror.com`），或在桌面端设置页选择镜像地址。

## 命令

任务类命令需显式指定 `--model <id>`（任意 transformers.js 兼容的 ONNX 模型）；`model` 子命令以位置参数传入模型 id。

```bash
nyx model pull <model> --task <text-generation|image-to-image>   # 预下载模型
nyx model list                                                   # 列出本地已缓存模型（别名：ls）
nyx model remove <model> [--yes]                                 # 删除已缓存模型

nyx --model "<id>"                                               # 交互式聊天 TUI（需要终端）
nyx text-generation --model "<id>" --message "你好"              # 一次性文本生成
nyx image-to-image <input> --model "<id>" [-o out.png]           # 图生图变换
```

chat TUI 中：输入消息回车发送，`/clear` 清空对话，`/quit`（或 Ctrl+C）退出。回复以 markdown 流式显示。

## 桌面应用

桌面端把推理放在独立启动的 server 子进程中（onnxruntime 在 Electron 的 Node 运行时中会崩溃）。先构建 server 产物，再启动应用：

```bash
bun --cwd packages/server run build   # 生成 packages/server/dist/server.cjs
bun run dev:desktop                   # 启动 Electron 应用
```

打包使用 `bun --cwd apps/desktop run make`。

## 开发

```bash
bun run typecheck        # 所有包类型检查
```

`bun run lint` / `bun run test` 虽存在但尚无对应包脚本；验证以 `bun run typecheck` 为准。
