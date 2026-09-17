/**
 * IPC wire types shared between main, preload, and renderer. All must be
 * structured-cloneable across the contextBridge (no classes/Errors).
 */

// HTTP wire types live in @nyx/server/schema.
import type {
  AudioResult,
  AudioSamples,
  ChatMessageMetadata,
  ContextCheckpoint,
  ImageBytes,
  ImageResult,
  KnowledgeDocument,
  KnowledgeDocumentStatus,
  KnowledgeImportResult,
  KnowledgeIndexProgress,
  KnowledgeSearchHit,
  KnowledgeStatus,
  SavedAttachment,
  TextToSpeechInput,
  TokenUsage,
  TranscriptResult,
  UIMessage,
  UIMessageChunk,
} from "@nyx/server/schema"
import type { AgentProviderEntry, AgentSettings, ChatSessionMeta, ModelInfo, Settings } from "@nyx/config"
import type { LLMTask } from "@nyx/llm"
export type {
  AgentProviderEntry,
  AgentSettings,
  AudioResult,
  AudioSamples,
  ChatMessageMetadata,
  ChatSessionMeta,
  ContextCheckpoint,
  ImageBytes,
  ImageResult,
  KnowledgeDocument,
  KnowledgeDocumentStatus,
  KnowledgeImportResult,
  KnowledgeIndexProgress,
  KnowledgeSearchHit,
  KnowledgeStatus,
  SavedAttachment,
  TextToSpeechInput,
  TokenUsage,
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

/** Summarize the transcript now (manual Compact); mirrors POST /v1/agent/compact. */
export interface ChatCompactRequest {
  messages: UIMessage[]
  workspaceDir?: string
  sessionId?: string
}

/** What one manual compaction produced. */
export interface CompactionResult {
  /** Attach to the newest transcript message so folding + the next turn pick it up. */
  checkpoint?: ContextCheckpoint
  compacted: boolean
  /** There was nothing older than the newest turn to summarize. */
  skipped?: "too-short"
  /** Heuristic size of the compacted transcript, and the same estimate beforehand. */
  estimatedTokens?: number
  baselineTokens?: number
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

/** Native yes/no confirmation dialog request. */
export interface ConfirmDialogRequest {
  message: string
  detail?: string
  /** Label for the affirmative button (default "Confirm"). */
  confirmLabel?: string
  /** Label for the negative button (default "Cancel"). */
  cancelLabel?: string
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

/** Provider-reported limits for one model (models.dev), for the context meter. */
export interface ModelLimits {
  context?: number
  input?: number
  output?: number
}
/** Progress pushed main → renderer while one knowledge index run is in flight. */
export interface KnowledgeIndexEvent extends KnowledgeIndexProgress {
  /** True on the run's last frame (done, cancelled or error). */
  done: boolean
  cancelled?: boolean
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
    /** Summarize the transcript now; resolves with the checkpoint to persist. */
    compact: (request: ChatCompactRequest) => Promise<CompactionResult>
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
  knowledge: {
    /** Documents, chunk count and index state in one call. */
    status: () => Promise<KnowledgeStatus>
    /** Every Markdown document with its index status. */
    list: () => Promise<KnowledgeDocument[]>
    /** One document's Markdown source. */
    read: (path: string) => Promise<string>
    /**
     * Pick Markdown files and copy them into `target`, a folder inside the
     * knowledge dir ("" for its root). Existing paths are only replaced after
     * the user confirms; resolves null when the picker was cancelled.
     */
    importFiles: (target: string) => Promise<KnowledgeImportResult | null>
    /** Import a folder's Markdown, nested under a folder named after it. */
    importFolder: (target: string) => Promise<KnowledgeImportResult | null>
    /** Delete a document after confirmation; false when the user declined. */
    remove: (path: string) => Promise<boolean>
    /** Update the index (or rebuild it from scratch); progress arrives via `onProgress`. */
    index: (rebuild: boolean) => Promise<void>
    /** Stop a running index build. */
    cancelIndex: () => Promise<boolean>
    /** Retrieval, for the page's search box. */
    search: (query: string, topK?: number) => Promise<KnowledgeSearchHit[]>
    /** Subscribe to index progress; returns an unsubscribe fn. */
    onProgress: (cb: (e: KnowledgeIndexEvent) => void) => () => void
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
    /** Context window etc. from the cached models.dev catalog; null when unknown. */
    modelLimits: (providerId: string, modelId: string) => Promise<ModelLimits | null>
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
    /** Native yes/no confirmation; resolves true when the user confirms. */
    confirm: (request: ConfirmDialogRequest) => Promise<boolean>
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
