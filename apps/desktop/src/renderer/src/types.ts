

import type { UIMessage, UIMessageChunk } from "ai"
import type { LLM } from "@nyx/llm"
import type { Global } from "@nyx/global"
import type { Agent } from "@nyx/agent"

export type LLMTask = LLM.LLMTask
export type AgentProviderEntry = Global.AgentProviderEntrySchemaType
export type AgentSettings = Global.AgentSettingsSchemaType
export type AudioResult = Agent.Services.AudioResult
export type AudioSamples = Agent.Services.AudioSamples
export type ChatMessageMetadata = Agent.ChatMessageMetadata
export type ChatSessionMeta = Agent.ChatSessionMeta
export type ContextCheckpoint = Agent.ContextCheckpoint
export type ImageBytes = Agent.Services.ImageBytes
export type ImageResult = Agent.Services.ImageResult
export type KnowledgeDocument = Agent.Services.KnowledgeDocument
export type KnowledgeDocumentStatus = Agent.Services.KnowledgeDocumentStatus
export type KnowledgeImportResult = Agent.Services.KnowledgeImportResult
export type KnowledgeIndexProgress = Agent.Services.KnowledgeIndexProgress
export type KnowledgeSearchHit = Agent.Services.KnowledgeSearchHit
export type KnowledgeSettings = Global.KnowledgeSettingsSchemaType
export type KnowledgeStatus = Agent.Services.KnowledgeStatus
export type ModelInfo = Agent.Services.ModelInfo
export type SavedAttachment = Agent.SavedAttachment
export type Settings = Global.SettingsSchemaType
export type TextToSpeechInput = Agent.Services.TextToSpeechInput
export type TokenUsage = Agent.TokenUsage
export type TranscriptResult = Agent.Services.TranscriptResult
export type { UIMessage, UIMessageChunk }

export interface ChatSendRequest {
  streamId: string
  body: Record<string, unknown>
}

export interface ChatCompactRequest {
  messages: UIMessage[]
  workspaceDir?: string
  sessionId?: string
}

export interface CompactionResult {
  
  checkpoint?: ContextCheckpoint
  compacted: boolean
  
  skipped?: "too-short"
  
  error?: string
  
  estimatedTokens?: number
  baselineTokens?: number
}

export type ChatStreamEvent =
  | { type: "chunk"; streamId: string; chunk: UIMessageChunk }
  | { type: "end"; streamId: string }
  | { type: "error"; streamId: string; message: string }

export interface ChatSession extends ChatSessionMeta {
  messages: UIMessage[]
}

export interface ChatSessionSaveRequest {
  id: string
  title: string
  workspaceDir: string
  messages: UIMessage[]
}

export interface SaveFileRequest {
  defaultPath?: string
  filters?: Array<{ name: string; extensions: string[] }>
  content: string
}

export interface ConfirmDialogRequest {
  message: string
  detail?: string
  
  confirmLabel?: string
  
  cancelLabel?: string
}

export interface AttachmentInput {
  data: Uint8Array
  name: string
  mimeType: string
}

export interface ProviderModels {
  ids: string[]
  error?: string
}

export interface KnowledgeIndexEvent extends KnowledgeIndexProgress {
  
  done: boolean
  cancelled?: boolean
  error?: string
  
  skipped?: number
}

export interface ModelPullProgress {
  modelId: string
  
  task?: LLMTask
  file?: string
  
  percent?: number
  loaded?: number
  total?: number
  done: boolean
  
  error?: string
  
  cancelled?: boolean
}

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
    
    compact: (request: ChatCompactRequest) => Promise<CompactionResult>
    abort: (streamId: string) => Promise<void>
    
    onEvent: (cb: (e: ChatStreamEvent) => void) => () => void
  }
  models: {
    list: () => Promise<ModelInfo[]>
    pull: (modelId: string, task: LLMTask) => Promise<void>
    
    cancelPull: (modelId: string) => Promise<boolean>
    remove: (modelId: string) => Promise<void>
    
    onProgress: (cb: (p: ModelPullProgress) => void) => () => void
  }
  knowledge: {
    
    status: () => Promise<KnowledgeStatus>
    
    list: () => Promise<KnowledgeDocument[]>
    
    read: (path: string) => Promise<string>
    
    importFiles: (target: string) => Promise<KnowledgeImportResult | null>
    
    importFolder: (target: string) => Promise<KnowledgeImportResult | null>
    
    remove: (path: string) => Promise<boolean>
    
    index: (rebuild: boolean) => Promise<void>
    
    cancelIndex: () => Promise<boolean>
    
    search: (query: string, topK?: number) => Promise<KnowledgeSearchHit[]>
    
    onProgress: (cb: (e: KnowledgeIndexEvent) => void) => () => void
  }
  config: {
    getSettings: () => Promise<Settings>
    setSettings: (patch: Settings) => Promise<Settings>
    
    writeSettings: (settings: Settings) => Promise<Settings>
    
    listModels: (provider: AgentProviderEntry) => Promise<ProviderModels>
    
    restartServer: () => Promise<void>
  }
  sessions: {
    
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
    
    selectDirectory: () => Promise<string | null>
    
    saveFile: (request: SaveFileRequest) => Promise<string | null>
    
    confirm: (request: ConfirmDialogRequest) => Promise<boolean>
  }
  files: {
    
    readDataUrl: (path: string) => Promise<string | null>
    
    saveAttachment: (input: AttachmentInput & { workspaceDir: string; sessionId: string }) => Promise<SavedAttachment>
  }
  window: {
    minimize: () => void
    toggleMaximize: () => void
    close: () => void
    onMaximized: (cb: (maximized: boolean) => void) => () => void
  }
}
