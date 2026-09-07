import { contextBridge, ipcRenderer } from "electron"
import { IPC } from "../shared/ipc"
import type {
  TextGenerationEvent,
  ImagePayload,
  ImageResult,
  ModelInfo,
  ModelPullProgress,
  LLMTask,
  NyxApi,
} from "../shared/types"

const api: NyxApi = {
  tasks: {
    textGeneration: {
      send: (modelId, messages) =>
        ipcRenderer.invoke(IPC.tasks.textGeneration.send, modelId, messages),
      abort: () => ipcRenderer.invoke(IPC.tasks.textGeneration.abort),
      onEvent: (cb) => {
        const listener = (
          _e: Electron.IpcRendererEvent,
          event: TextGenerationEvent,
        ) => cb(event)
        ipcRenderer.on(IPC.tasks.textGeneration.event, listener)
        return () =>
          ipcRenderer.removeListener(IPC.tasks.textGeneration.event, listener)
      },
    },
    imageToImage: {
      run: (modelId: string, input: ImagePayload): Promise<ImageResult> =>
        ipcRenderer.invoke(IPC.tasks.imageToImage.run, modelId, input),
    },
  },
  models: {
    list: (): Promise<ModelInfo[]> => ipcRenderer.invoke(IPC.models.list),
    pull: (modelId: string, task: LLMTask) =>
      ipcRenderer.invoke(IPC.models.pull, modelId, task),
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
