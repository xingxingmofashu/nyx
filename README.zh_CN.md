# nyx

本地运行 ONNX 文件的推理工具 —— 纯本地，无云端，数据不出本机。

## 定位

nyx 是一个本地 ONNX 推理工具：

- **本地对话**：ONNX 小模型做文本生成（Qwen2.5-0.5B-Instruct）
- **本地 embedding**：语义向量、相似度计算（bge-small-zh-v1.5）
- **极简核心**：只保留 Agent（一次性对话），无会话/工具/权限

## 架构

bun monorepo：

- `packages/llm` — 模型运行时 + 任务（`runtime.ts` 共享加载器、`tasks/chat.ts`、`tasks/embedding.ts`），基于 onnxruntime-node / transformers.js
- `packages/core` — 极简 Agent（一次性本地对话）
- `packages/server` — Hono HTTP 服务（health / chat / embed）
- `apps/cli` — 终端 CLI（yargs）

## 快速开始

```bash
bun install
bun run cli -- --help
```

### 本地模型

模型缓存在 `~/.nyx/models/`，需要两个：

**1. 对话模型** — `onnx-community/Qwen2.5-0.5B-Instruct`（量化，~400MB）

```bash
mkdir -p ~/.nyx/models/onnx-community/Qwen2.5-0.5B-Instruct
cd ~/.nyx/models/onnx-community/Qwen2.5-0.5B-Instruct
# 需要: config.json, tokenizer.json, tokenizer_config.json, generation_config.json,
#       onnx/model_q4.onnx (或 q8/fp16 变体)
# 可从 https://huggingface.co/onnx-community/Qwen2.5-0.5B-Instruct 下载
```

**2. Embedding 模型** — `Xenova/bge-small-zh-v1.5`（512 维中英，~95MB）

```bash
mkdir -p ~/.nyx/models/Xenova/bge-small-zh-v1.5/onnx
cd ~/.nyx/models/Xenova/bge-small-zh-v1.5
for f in config.json tokenizer.json tokenizer_config.json special_tokens_map.json vocab.txt; do
  curl -L -o "$f" "https://huggingface.co/Xenova/bge-small-zh-v1.5/resolve/main/$f?download=true"
done
curl -L -o onnx/model.onnx "https://huggingface.co/Xenova/bge-small-zh-v1.5/resolve/main/onnx/model.onnx?download=true"
```

## 命令

```bash
nyx chat                              # 交互式 TUI（需要终端）
nyx chat --message "你好"             # 一次性本地对话
nyx chat --model "<id>" --message "你好"  # 指定模型
nyx server                            # 本地 HTTP 服务（默认 3848）
nyx embed <text> [--compare <other>]  # 一次性本地 embedding
```

chat TUI 中：输入消息回车发送，`/clear` 清空对话，`/quit`（或 Ctrl+C）退出。回复以 markdown 流式显示。

## Server API

```bash
GET  /api/health          # 健康检查
POST /api/chat            # { message } -> { text }  本地对话
POST /api/embed           # { texts }   -> number[][] 本地向量
```

## 开发

```bash
bun run typecheck        # 所有包类型检查
```
