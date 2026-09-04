/**
 * IPC wire types shared between main, preload, and renderer.
 *
 * All types here must be structured-cloneable across the contextBridge
 * boundary (no class instances, no Error objects — errors are reduced to
 * `{ message }`).
 */

// HTTP wire types (image requests/results) live in @nyx/server/types.
import type { ImagePayload, ImageResult } from "@nyx/server/types"
import type { ModelInfo } from "@nyx/config"
import type { LLMMessage, LlmTask } from "@nyx/llm"
export type { ImagePayload, ImageResult, LLMMessage, LlmTask, ModelInfo }

// --- Text generation ---

/** A message as displayed in the text-generation UI (role + text accumulation). */
export interface DisplayMessage {
  id: string
  role: "user" | "assistant"
  text: string
  /** True while the assistant message is still streaming. */
  streaming?: boolean
  error?: boolean
}

/**
 * Streaming text-generation events pushed main → renderer as the server SSE
 * stream is read. Mirrors the server's /v1/text-generation SSE wire events.
 */
export type TextGenerationEvent =
  | { type: "delta"; text: string }
  | { type: "end"; text: string }
  | { type: "error"; message: string }

// --- Model pull progress (IPC events; the pull endpoint itself is opaque) ---

export interface ModelPullProgress {
  modelId: string
  file?: string
  /** 0..100 when status is "progress". */
  percent?: number
  loaded?: number
  total?: number
  done: boolean
}

// --- The preload-exposed API ---

export interface NyxApi {
  textGeneration: {
    /** Stream a text-generation turn over the full transcript using the given model. */
    send: (modelId: string, messages: LLMMessage[]) => Promise<void>
    abort: () => Promise<void>
    /** Subscribe to streaming events. Returns an unsubscribe fn. */
    onEvent: (cb: (e: TextGenerationEvent) => void) => () => void
  }
  imageToImage: {
    run: (modelId: string, input: ImagePayload) => Promise<ImageResult>
  }
  models: {
    list: () => Promise<ModelInfo[]>
    pull: (modelId: string, task: LlmTask) => Promise<void>
    /** Subscribe to pull progress. Returns an unsubscribe fn. */
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
