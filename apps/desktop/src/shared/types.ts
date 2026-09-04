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
 * Serialized chat events pushed main → renderer (errors collapsed to a
 * message string; mirrors the server's SSE wire events).
 */
export type ChatEvent =
  | { type: "message_start"; role: "user" | "assistant" }
  | { type: "message_update"; text: string }
  | { type: "message_end"; text: string }
  | { type: "agent_error"; message: string }

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
    /** Send the full transcript; the server runs one stateless turn on it. */
    send: (messages: ChatMessage[]) => Promise<void>
    abort: () => Promise<void>
    setModel: (modelId: string) => Promise<void>
    /** Subscribe to streaming events. Returns an unsubscribe fn. */
    onEvent: (cb: (e: ChatEvent) => void) => () => void
  }
  image: {
    run: (input: ImagePayload, modelId: string) => Promise<ImageResult>
    setModel: (modelId: string) => Promise<void>
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
