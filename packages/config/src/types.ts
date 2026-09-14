import type { DataType, PipelineType } from "@huggingface/transformers"

/** App-level user settings, persisted at ~/.nyx/settings.json. */
export interface Settings {
  /** Hugging Face endpoint used for model downloads (mirror override, e.g. https://hf-mirror.com). */
  hubBaseUrl?: string
  /** Remote "master brain" used by the agent; env vars override each field. */
  agent?: AgentSettings
}

/** Remote brain configuration; every field can be overridden by a NYX_AGENT_* env var. */
export interface AgentSettings {
  /** Provider id understood by @nyx/agent (e.g. "openai-compatible", "anthropic"). */
  provider?: string
  model?: string
  /** API base URL (required for the openai-compatible provider). */
  baseUrl?: string
  apiKey?: string
  /** Extra request headers (some gateways require e.g. a session header). */
  headers?: Record<string, string>
  systemPrompt?: string
  maxSteps?: number
}

/** A locally installed model record. */
export interface ModelInfo {
  id: string
  name: string
  task: PipelineType
  /** Dtype used when pulling; absent when the transformers.js default was used. */
  dtype?: DataType
  createdAt: string
}

/** Model registry persisted at ~/.nyx/models.json. */
export interface ModelConfig {
  provider: Record<string, { models: Record<string, ModelInfo> }>
}
