# nyx

本地运行 ONNX 文件的推理工具 —— 纯本地，无云端，数据不出本机。

## 定位

nyx 通过 transformers.js 本地运行 ONNX 模型：

- **文本生成**：ONNX 小模型（Qwen2.5-0.5B-Instruct），支持一次性提示与交互式 TUI
- **图生图**：超分等图像变换（默认 4x_APISR_GRL_GAN）
- **极简核心**：只保留 Agent（一次性对话），无会话/工具

## 架构

bun monorepo：

- `packages/llm` — 模型运行时 + 任务（`runtime.ts` 共享加载器、`tasks/text-generation.ts`、`tasks/image-to-image.ts`），基于 onnxruntime-node / transformers.js
- `packages/core` — 极简 Agent（一次性本地对话）
- `apps/cli` — 终端 CLI（yargs）：`nyx`（交互式 TUI）、`nyx text-generation`、`nyx image-to-image`

## 快速开始

```bash
bun install
bun run --filter='@nyx/coding-agent' -- src/index.ts --help
```

### 本地模型

模型缓存在 `~/.nyx/models/`，首次使用自动从 Hugging Face 下载。可用 `nyx pull` 预下载。

## 命令

所有模型命令都需显式指定 `--model <id>`（任意 transformers.js 兼容的 ONNX 模型）。

```bash
nyx model pull <model> --task text-generation   # 预下载文本生成模型
nyx model pull <model> --task image-to-image    # 预下载图生图模型
nyx model ls                                     # 列出本地已缓存模型

nyx --model "<id>"                         # 交互式聊天 TUI（需要终端）
nyx text-generation --model "<id>" --message "你好"     # 一次性文本生成
nyx image-to-image <input> --model "<id>" -o out.png     # 图生图变换
```

chat TUI 中：输入消息回车发送，`/clear` 清空对话，`/quit`（或 Ctrl+C）退出。回复以 markdown 流式显示。

## 开发

```bash
bun run typecheck        # 所有包类型检查
```
