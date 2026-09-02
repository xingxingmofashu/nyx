import { contextBridge, ipcRenderer } from "electron"
import { IPC } from "../shared/ipc"
import type { ChatEvent, ImagePayload, ImageResult, ModelInfo, ModelPullProgress, ModelTask, NyxApi } from "../shared/types"

const api: NyxApi = {
  chat: {
    send: (text) => ipcRenderer.invoke(IPC.chat.send, text),
    abort: () => ipcRenderer.invoke(IPC.chat.abort),
    setModel: (modelId) => ipcRenderer.invoke(IPC.chat.setModel, modelId),
    onEvent: (cb) => {
      const listener = (_e: Electron.IpcRendererEvent, event: ChatEvent) => cb(event)
      ipcRenderer.on(IPC.chat.event, listener)
      return () => ipcRenderer.removeListener(IPC.chat.event, listener)
    },
  },
  image: {
    run: (input: ImagePayload, modelId: string): Promise<ImageResult> =>
      ipcRenderer.invoke(IPC.image.run, input, modelId),
    setModel: (modelId) => ipcRenderer.invoke(IPC.image.setModel, modelId),
  },
  models: {
    list: (): Promise<ModelInfo[]> => ipcRenderer.invoke(IPC.models.list),
    pull: (modelId: string, task: ModelTask) => ipcRenderer.invoke(IPC.models.pull, modelId, task),
    onProgress: (cb) => {
      const listener = (_e: Electron.IpcRendererEvent, p: ModelPullProgress) => cb(p)
      ipcRenderer.on(IPC.models.progress, listener)
      return () => ipcRenderer.removeListener(IPC.models.progress, listener)
    },
  },
  config: {
    getModelsDir: (): Promise<string> => ipcRenderer.invoke(IPC.config.getModelsDir),
  },
  window: {
    minimize: () => ipcRenderer.send(IPC.window.minimize),
    toggleMaximize: () => ipcRenderer.send(IPC.window.toggleMaximize),
    close: () => ipcRenderer.send(IPC.window.close),
    onMaximized: (cb) => {
      const listener = (_e: Electron.IpcRendererEvent, maximized: boolean) => cb(maximized)
      ipcRenderer.on(IPC.window.maximized, listener)
      return () => ipcRenderer.removeListener(IPC.window.maximized, listener)
    },
  },
}

contextBridge.exposeInMainWorld("nyx", api)
