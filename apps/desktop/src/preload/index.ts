import { contextBridge, ipcRenderer } from "electron"
import { IPC } from "./ipc"
import type {
  ChatCompactRequest,
  ChatSendRequest,
  ChatSessionMeta,
  ChatSessionSaveRequest,
  ChatStreamEvent,
  AttachmentInput,
  AudioResult,
  AudioSamples,
  ConfirmDialogRequest,
  ImageBytes,
  ImageResult,
  KnowledgeDocument,
  KnowledgeImportResult,
  KnowledgeIndexEvent,
  KnowledgeSearchHit,
  KnowledgeStatus,
  ModelInfo,
  ModelPullProgress,
  SaveFileRequest,
  TextToSpeechInput,
  TranscriptResult,
  LLMTask,
  NyxApi,
} from "../renderer/src/types"

const api: NyxApi = {
  tasks: {
    imageToImage: {
      run: (modelId: string, input: ImageBytes): Promise<ImageResult> =>
        ipcRenderer.invoke(IPC.tasks.imageToImage.run, modelId, input),
    },
    textToSpeech: {
      run: (modelId: string, input: TextToSpeechInput): Promise<AudioResult> =>
        ipcRenderer.invoke(IPC.tasks.textToSpeech.run, modelId, input),
    },
    automaticSpeechRecognition: {
      run: (modelId: string, input: AudioSamples): Promise<TranscriptResult> =>
        ipcRenderer.invoke(IPC.tasks.automaticSpeechRecognition.run, modelId, input),
    },
  },
  chat: {
    send: (request: ChatSendRequest) => ipcRenderer.invoke(IPC.chat.send, request),
    compact: (request: ChatCompactRequest) => ipcRenderer.invoke(IPC.chat.compact, request),
    abort: (streamId: string) => ipcRenderer.invoke(IPC.chat.abort, streamId),
    onEvent: (cb) => {
      const listener = (_e: Electron.IpcRendererEvent, event: ChatStreamEvent) => cb(event)
      ipcRenderer.on(IPC.chat.event, listener)
      return () => ipcRenderer.removeListener(IPC.chat.event, listener)
    },
  },
  models: {
    list: (): Promise<ModelInfo[]> => ipcRenderer.invoke(IPC.models.list),
    pull: (modelId: string, task: LLMTask) =>
      ipcRenderer.invoke(IPC.models.pull, modelId, task),
    cancelPull: (modelId: string) =>
      ipcRenderer.invoke(IPC.models.cancelPull, modelId),
    remove: (modelId: string) => ipcRenderer.invoke(IPC.models.remove, modelId),
    onProgress: (cb) => {
      const listener = (_e: Electron.IpcRendererEvent, p: ModelPullProgress) =>
        cb(p)
      ipcRenderer.on(IPC.models.progress, listener)
      return () => ipcRenderer.removeListener(IPC.models.progress, listener)
    },
  },
  knowledge: {
    status: (): Promise<KnowledgeStatus> => ipcRenderer.invoke(IPC.knowledge.status),
    list: (): Promise<KnowledgeDocument[]> => ipcRenderer.invoke(IPC.knowledge.list),
    read: (path: string): Promise<string> => ipcRenderer.invoke(IPC.knowledge.read, path),
    importFiles: (target: string): Promise<KnowledgeImportResult | null> =>
      ipcRenderer.invoke(IPC.knowledge.importFiles, target),
    importFolder: (target: string): Promise<KnowledgeImportResult | null> =>
      ipcRenderer.invoke(IPC.knowledge.importFolder, target),
    remove: (path: string): Promise<boolean> =>
      ipcRenderer.invoke(IPC.knowledge.remove, path),
    index: (rebuild: boolean): Promise<void> =>
      ipcRenderer.invoke(IPC.knowledge.index, rebuild),
    cancelIndex: (): Promise<boolean> => ipcRenderer.invoke(IPC.knowledge.cancelIndex),
    search: (query: string, topK?: number): Promise<KnowledgeSearchHit[]> =>
      ipcRenderer.invoke(IPC.knowledge.search, query, topK),
    onProgress: (cb) => {
      const listener = (_e: Electron.IpcRendererEvent, event: KnowledgeIndexEvent) => cb(event)
      ipcRenderer.on(IPC.knowledge.progress, listener)
      return () => ipcRenderer.removeListener(IPC.knowledge.progress, listener)
    },
  },
  config: {
    getSettings: () => ipcRenderer.invoke(IPC.config.getSettings),
    setSettings: (patch) => ipcRenderer.invoke(IPC.config.setSettings, patch),
    writeSettings: (settings) =>
      ipcRenderer.invoke(IPC.config.writeSettings, settings),
    listModels: (provider) =>
      ipcRenderer.invoke(IPC.config.listModels, provider),
    restartServer: (): Promise<void> =>
      ipcRenderer.invoke(IPC.config.restartServer),
  },
  sessions: {
    list: (workspaceDir: string): Promise<ChatSessionMeta[]> =>
      ipcRenderer.invoke(IPC.sessions.list, workspaceDir),
    get: (workspaceDir: string, id: string) =>
      ipcRenderer.invoke(IPC.sessions.get, workspaceDir, id),
    save: (session: ChatSessionSaveRequest) =>
      ipcRenderer.invoke(IPC.sessions.save, session),
    rename: (workspaceDir: string, id: string, title: string) =>
      ipcRenderer.invoke(IPC.sessions.rename, workspaceDir, id, title),
    setPinned: (workspaceDir: string, id: string, pinned: boolean) =>
      ipcRenderer.invoke(IPC.sessions.setPinned, workspaceDir, id, pinned),
    remove: (workspaceDir: string, id: string): Promise<void> =>
      ipcRenderer.invoke(IPC.sessions.remove, workspaceDir, id),
    getActive: (workspaceDir: string): Promise<string | null> =>
      ipcRenderer.invoke(IPC.sessions.getActive, workspaceDir),
    setActive: (workspaceDir: string, id: string | null): Promise<void> =>
      ipcRenderer.invoke(IPC.sessions.setActive, workspaceDir, id),
  },
  dialog: {
    selectDirectory: (): Promise<string | null> =>
      ipcRenderer.invoke(IPC.dialog.selectDirectory),
    saveFile: (request: SaveFileRequest): Promise<string | null> =>
      ipcRenderer.invoke(IPC.dialog.saveFile, request),
    confirm: (request: ConfirmDialogRequest): Promise<boolean> =>
      ipcRenderer.invoke(IPC.dialog.confirm, request),
  },
  files: {
    readDataUrl: (path: string): Promise<string | null> =>
      ipcRenderer.invoke(IPC.files.readDataUrl, path),
    saveAttachment: (input: AttachmentInput & { workspaceDir: string; sessionId: string }) =>
      ipcRenderer.invoke(IPC.files.saveAttachment, input),
  },
  window: {
    minimize: () => ipcRenderer.send(IPC.window.minimize),
    toggleMaximize: () => ipcRenderer.send(IPC.window.toggleMaximize),
    close: () => ipcRenderer.send(IPC.window.close),
    onMaximized: (cb) => {
      const listener = (_e: Electron.IpcRendererEvent, maximized: boolean) =>
        cb(maximized)
      ipcRenderer.on(IPC.window.maximized, listener)
      return () => ipcRenderer.removeListener(IPC.window.maximized, listener)
    },
  },
}

contextBridge.exposeInMainWorld("nyx", api)
