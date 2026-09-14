import type { DataType, PipelineType } from "@huggingface/transformers"

/** App-level user settings, persisted at ~/.nyx/settings.json. */
export interface Settings {
  /** Hugging Face endpoint used for model downloads (mirror override, e.g. https://hf-mirror.com). */
  hubBaseUrl?: string
  /** Remote "master brain" used by the agent; env vars override each field. */
  agent?: AgentSettings
}

/** Remote brain configuration; every field can be overridden by an env var. */
export interface AgentSettings {
  /** Active model as `<providerId>/<modelId>`, e.g. "opencode/mimo-v2.5". */
  model?: string
  /** Named provider definitions the model ref resolves against. */
  provider?: Record<string, AgentProviderEntry>
  /** Per-tool toggles for the agent. */
  tools?: AgentToolsSettings
  systemPrompt?: string
  maxSteps?: number
}

/** Optional agent tool toggles. */
export interface AgentToolsSettings {
  /** Expose locally installed ONNX models as tools the brain may call (default false). */
  localModels?: boolean
}

/** One provider definition (opencode-style): an AI SDK package + its options. */
export interface AgentProviderEntry {
  /** AI SDK provider package, e.g. "@ai-sdk/openai-compatible" or "@ai-sdk/anthropic". */
  npm: string
  /** Display name. */
  name?: string
  /** Options forwarded to the provider factory (baseURL, apiKey, headers, …). */
  options?: AgentProviderOptions
  /** Token limits; `output` caps max output tokens, `context` is metadata only. */
  limit?: AgentProviderLimit
}

export interface AgentProviderOptions {
  baseURL?: string
  apiKey?: string
  headers?: Record<string, string>
  [key: string]: unknown
}

export interface AgentProviderLimit {
  /** Context window (stored as metadata only). */
  context?: number | string
  /** Max output tokens, forwarded to the model. */
  output?: number
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
