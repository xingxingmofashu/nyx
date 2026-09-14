/**
 * IPC wire types shared between main, preload, and renderer. All must be
 * structured-cloneable across the contextBridge (no classes/Errors).
 */

// HTTP wire types live in @nyx/server/types.
import type {
  AudioResult,
  ImageBytes,
  ImageResult,
  TextToSpeechInput,
  UIMessage,
  UIMessageChunk,
} from "@nyx/server/types"
import type { ModelInfo, Settings } from "@nyx/config"
import type { LLMTask } from "@nyx/llm"
export type {
  AudioResult,
  ImageBytes,
  ImageResult,
  TextToSpeechInput,
  UIMessage,
  UIMessageChunk,
  LLMTask,
  ModelInfo,
  Settings,
}

/** Start an agent chat stream; `body` is the `/v1/agent` JSON request body. */
export interface ChatSendRequest {
  streamId: string
  body: Record<string, unknown>
}

/** Events pushed main → renderer for a chat stream (AI SDK UI message chunks). */
export type ChatStreamEvent =
  | { type: "chunk"; streamId: string; chunk: UIMessageChunk }
  | { type: "end"; streamId: string }
  | { type: "error"; streamId: string; message: string }

export interface ModelPullProgress {
  modelId: string
  /** Task being pulled; set on the initial kickoff, kept on later events. */
  task?: LLMTask
  file?: string
  /** 0..100 when status is "progress". */
  percent?: number
  loaded?: number
  total?: number
  done: boolean
  /** Present when the pull failed. */
  error?: string
  /** True when the pull was cancelled by the user. */
  cancelled?: boolean
}

/** The preload-exposed API surface. */
export interface NyxApi {
  tasks: {
    imageToImage: {
      run: (modelId: string, input: ImageBytes) => Promise<ImageResult>
    }
    textToSpeech: {
      run: (modelId: string, input: TextToSpeechInput) => Promise<AudioResult>
    }
  }
  chat: {
    send: (request: ChatSendRequest) => Promise<void>
    abort: (streamId: string) => Promise<void>
    /** Subscribe to chat stream events; returns an unsubscribe fn. */
    onEvent: (cb: (e: ChatStreamEvent) => void) => () => void
  }
  models: {
    list: () => Promise<ModelInfo[]>
    pull: (modelId: string, task: LLMTask) => Promise<void>
    /** Resolve true when a running pull was aborted. */
    cancelPull: (modelId: string) => Promise<boolean>
    remove: (modelId: string) => Promise<void>
    /** Subscribe to pull progress; returns an unsubscribe fn. */
    onProgress: (cb: (p: ModelPullProgress) => void) => () => void
  }
  config: {
    getModelsDir: () => Promise<string>
    getSettings: () => Promise<Settings>
    setSettings: (patch: Settings) => Promise<Settings>
  }
  dialog: {
    /** Native folder picker; resolves the chosen path, or null if cancelled. */
    selectDirectory: () => Promise<string | null>
  }
  window: {
    minimize: () => void
    toggleMaximize: () => void
    close: () => void
    onMaximized: (cb: (maximized: boolean) => void) => () => void
  }
}
