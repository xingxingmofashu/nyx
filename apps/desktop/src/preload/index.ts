import { contextBridge, ipcRenderer } from "electron"
import { IPC } from "../shared/ipc"
import type {
  ChatSendRequest,
  ChatStreamEvent,
  AudioResult,
  AudioSamples,
  ImageBytes,
  ImageResult,
  ModelInfo,
  ModelPullProgress,
  TextToSpeechInput,
  TranscriptResult,
  LLMTask,
  NyxApi,
} from "../shared/types"

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
  config: {
    getModelsDir: (): Promise<string> =>
      ipcRenderer.invoke(IPC.config.getModelsDir),
    getSettings: () => ipcRenderer.invoke(IPC.config.getSettings),
    setSettings: (patch) => ipcRenderer.invoke(IPC.config.setSettings, patch),
  },
  dialog: {
    selectDirectory: (): Promise<string | null> =>
      ipcRenderer.invoke(IPC.dialog.selectDirectory),
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
