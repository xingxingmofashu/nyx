import type { DataType, PipelineType } from "@huggingface/transformers"

/** App-level user settings, persisted at ~/.nyx/settings.json. */
export interface Settings {
  /** Hugging Face endpoint used for model downloads (mirror override, e.g. https://hf-mirror.com). */
  hubBaseUrl?: string
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
