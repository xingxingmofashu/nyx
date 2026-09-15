/**
 * IPC wire types shared between main, preload, and renderer. All must be
 * structured-cloneable across the contextBridge (no classes/Errors).
 */

// HTTP wire types live in @nyx/server/types.
import type {
  AudioResult,
  AudioSamples,
  ChatMessageMetadata,
  ImageBytes,
  ImageResult,
  SavedAttachment,
  TextToSpeechInput,
  TranscriptResult,
  UIMessage,
  UIMessageChunk,
} from "@nyx/server/types"
import type { AgentProviderEntry, AgentSettings, ChatSessionMeta, ModelInfo, Settings } from "@nyx/config"
import type { LLMTask } from "@nyx/llm"
export type {
  AgentProviderEntry,
  AgentSettings,
  AudioResult,
  AudioSamples,
  ChatMessageMetadata,
  ChatSessionMeta,
  ImageBytes,
  ImageResult,
  SavedAttachment,
  TextToSpeechInput,
  TranscriptResult,
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

/** A persisted agent chat session, including its full AI SDK transcript. */
export interface ChatSession extends ChatSessionMeta {
  messages: UIMessage[]
}

/** Upsert payload for a session; the renderer derives the title. */
export interface ChatSessionSaveRequest {
  id: string
  title: string
  workspaceDir: string
  messages: UIMessage[]
}

/** Native save dialog request; main writes `content` to the chosen path. */
export interface SaveFileRequest {
  defaultPath?: string
  filters?: Array<{ name: string; extensions: string[] }>
  content: string
}

/** Bytes of one attachment the user attached to a chat message. */
export interface AttachmentInput {
  data: Uint8Array
  name: string
  mimeType: string
}

/** Read-only environment info for the Settings page. */
export interface AppEnvironment {
  modelsDir: string
  knowledgeDir: string
  /** Names of env vars set in the main process that override settings.json. */
  envOverrides: string[]
}

/** Model ids available from one provider, or why the list couldn't be fetched. */
export interface ProviderModels {
  ids: string[]
  error?: string
}

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
    automaticSpeechRecognition: {
      run: (modelId: string, input: AudioSamples) => Promise<TranscriptResult>
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
    /** Replace settings.json wholesale; can remove keys. */
    writeSettings: (settings: Settings) => Promise<Settings>
    getEnvironment: () => Promise<AppEnvironment>
    /** List a provider's models via the main process (no CORS). */
    listModels: (provider: AgentProviderEntry) => Promise<ProviderModels>
    /** Restart the inference server (needed after changing the HF endpoint). */
    restartServer: () => Promise<void>
  }
  sessions: {
    /** Sessions of one workspace (the sidebar is scoped to the active one). */
    list: (workspaceDir: string) => Promise<ChatSessionMeta[]>
    get: (workspaceDir: string, id: string) => Promise<ChatSession | null>
    save: (session: ChatSessionSaveRequest) => Promise<ChatSessionMeta>
    rename: (workspaceDir: string, id: string, title: string) => Promise<ChatSessionMeta | null>
    setPinned: (workspaceDir: string, id: string, pinned: boolean) => Promise<ChatSessionMeta | null>
    remove: (workspaceDir: string, id: string) => Promise<void>
    getActive: (workspaceDir: string) => Promise<string | null>
    setActive: (workspaceDir: string, id: string | null) => Promise<void>
  }
  dialog: {
    /** Native folder picker; resolves the chosen path, or null if cancelled. */
    selectDirectory: () => Promise<string | null>
    /** Native save dialog; main writes the content and resolves the path (or null). */
    saveFile: (request: SaveFileRequest) => Promise<string | null>
  }
  files: {
    /** Read an agent-generated file (a workspace output or an audio clip) as a data URL; null if unavailable. */
    readDataUrl: (path: string) => Promise<string | null>
    /** Copy an attachment into the workspace's session folder; resolves its absolute path. */
    saveAttachment: (input: AttachmentInput & { workspaceDir: string; sessionId: string }) => Promise<SavedAttachment>
  }
  window: {
    minimize: () => void
    toggleMaximize: () => void
    close: () => void
    onMaximized: (cb: (maximized: boolean) => void) => () => void
  }
}
