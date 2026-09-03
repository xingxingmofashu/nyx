/**
 * IPC wire types shared between main, preload, and renderer.
 *
 * All types here must be structured-cloneable across the contextBridge
 * boundary (no class instances, no Error objects — errors are reduced to
 * `{ message }`).
 */

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
 * Serialized agent events pushed main → renderer (mirrors @nyx/core AgentEvent
 * with Error collapsed to a message string).
 */
export type ChatEvent =
  | { type: "message_start"; role: "user" | "assistant" }
  | { type: "message_update"; text: string }
  | { type: "message_end"; text: string }
  | { type: "agent_error"; message: string }

// --- Image-to-image ---

export interface ImagePayload {
  /** Raw encoded image bytes (png/jpeg/webp). */
  data: Uint8Array
  mimeType: string
}

export interface ImageResult {
  data: Uint8Array
  mimeType: string
  width: number
  height: number
}

// --- Models ---

export type ModelTask = "text-generation" | "image-to-image"

/** Installed model as reported by the server's /v1/models. */
export interface ModelInfo {
  id: string
  name: string
  task: string
  dtype?: string
  createdAt?: string
}

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
    send: (text: string) => Promise<void>
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
