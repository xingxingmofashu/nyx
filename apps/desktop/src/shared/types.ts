/**
 * IPC wire types shared between main, preload, and renderer. All must be
 * structured-cloneable across the contextBridge (no classes/Errors).
 */

// HTTP wire types live in @nyx/server/types.
import type { ImagePayload, ImageResult } from "@nyx/server/types"
import type { ModelInfo } from "@nyx/config"
import type { LLMMessage, LlmTask } from "@nyx/llm"
export type { ImagePayload, ImageResult, LLMMessage, LlmTask, ModelInfo }

/** A message as displayed in the text-generation UI. */
export interface DisplayMessage {
  id: string
  role: "user" | "assistant"
  text: string
  /** True while the assistant message is still streaming. */
  streaming?: boolean
  error?: boolean
}

/** Streaming events pushed main → renderer (mirrors the server SSE wire). */
export type TextGenerationEvent =
  | { type: "delta"; text: string }
  | { type: "end"; text: string }
  | { type: "error"; message: string }

export interface ModelPullProgress {
  modelId: string
  file?: string
  /** 0..100 when status is "progress". */
  percent?: number
  loaded?: number
  total?: number
  done: boolean
}

/** The preload-exposed API surface. */
export interface NyxApi {
  tasks: {
    textGeneration: {
      send: (modelId: string, messages: LLMMessage[]) => Promise<void>
      abort: () => Promise<void>
      /** Subscribe to streaming events; returns an unsubscribe fn. */
      onEvent: (cb: (e: TextGenerationEvent) => void) => () => void
    }
    imageToImage: {
      run: (modelId: string, input: ImagePayload) => Promise<ImageResult>
    }
  }
  models: {
    list: () => Promise<ModelInfo[]>
    pull: (modelId: string, task: LlmTask) => Promise<void>
    /** Subscribe to pull progress; returns an unsubscribe fn. */
    onProgress: (cb: (p: ModelPullProgress) => void) => () => void
  }
  config: {
    getModelsDir: () => Promise<string>
  }
  window: {
    minimize: () => void
    toggleMaximize: () => void
    close: () => void
    onMaximized: (cb: (maximized: boolean) => void) => () => void
  }
}
