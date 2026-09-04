/**
 * IPC wire types shared between main, preload, and renderer.
 *
 * All types here must be structured-cloneable across the contextBridge
 * boundary (no class instances, no Error objects — errors are reduced to
 * `{ message }`).
 */

// Wire types shared with the inference server live in @nyx/server/types.
import type { ChatMessage, ImagePayload, ImageResult, ModelInfo, ModelTask } from "@nyx/server/types"
export type { ChatMessage, ImagePayload, ImageResult, ModelInfo, ModelTask }

// --- Chat ---

/** A chat message as displayed in the UI (role + text accumulation). */
export interface ChatDisplayMessage {
  id: string
  role: "user" | "assistant"
  text: string
  /** True while the assistant message is still streaming. */
  streaming?: boolean
  error?: boolean
}

/**
 * Streaming chat events pushed main → renderer as the server SSE stream is
 * read. Mirrors the server's /v1/text-generation SSE wire events.
 */
export type ChatEvent =
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
  chat: {
    /** Stream a chat turn over the full transcript using the given model. */
    send: (modelId: string, messages: ChatMessage[]) => Promise<void>
    abort: () => Promise<void>
    /** Subscribe to streaming events. Returns an unsubscribe fn. */
    onEvent: (cb: (e: ChatEvent) => void) => () => void
  }
  image: {
    run: (modelId: string, input: ImagePayload) => Promise<ImageResult>
  }
  models: {
    list: () => Promise<ModelInfo[]>
    pull: (modelId: string, task: ModelTask) => Promise<void>
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
