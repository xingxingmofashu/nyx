import { BrowserWindow, ipcMain } from "electron"
import { getModelsDir } from "@nyx/config"
import { IPC } from "../shared/ipc"
import type { ImagePayload, ModelTask } from "../shared/types"
import { AgentService } from "./services/agent"
import { ImageService } from "./services/image"
import type { ServerManager } from "./server/manager"

interface Services {
  agent: AgentService
  image: ImageService
  manager: ServerManager
}

/** Register all ipcMain handlers. Must run after app is ready. */
export function registerIpc(services: Services): void {
  const { agent, image, manager } = services

  // --- Chat ---
  ipcMain.handle(IPC.chat.send, (_e, text: string) => agent.send(text))
  ipcMain.handle(IPC.chat.abort, () => agent.abort())
  ipcMain.handle(IPC.chat.setModel, (_e, modelId: string) => agent.setModel(modelId))

  // --- Image-to-image ---
  ipcMain.handle(IPC.image.run, (_e, input: ImagePayload, modelId: string) => {
    if (modelId) image.setModel(modelId)
    return image.run(input)
  })
  ipcMain.handle(IPC.image.setModel, (_e, modelId: string) => image.setModel(modelId))

  // --- Models ---
  ipcMain.handle(IPC.models.list, () => manager.client.listModels())
  ipcMain.handle(IPC.models.pull, (_e, modelId: string, task: ModelTask) => manager.client.pullModel(modelId, task))

  // --- Config ---
  ipcMain.handle(IPC.config.getModelsDir, () => getModelsDir())

  // --- Window controls (frameless) ---
  ipcMain.on(IPC.window.minimize, (e) => BrowserWindow.fromWebContents(e.sender)?.minimize())
  ipcMain.on(IPC.window.toggleMaximize, (e) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    if (!win) return
    win.isMaximized() ? win.unmaximize() : win.maximize()
  })
  ipcMain.on(IPC.window.close, (e) => BrowserWindow.fromWebContents(e.sender)?.close())
}
