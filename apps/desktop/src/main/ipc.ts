import { BrowserWindow, ipcMain } from "electron"
import { getModelsDir } from "@nyx/config"
import { IPC } from "../shared/ipc"
import type { LLMMessage, ImagePayload, LlmTask } from "../shared/types"
import { TextGenerationService } from "./services/text-generation"
import { ImageToImageService } from "./services/image-to-image"
import type { ServerManager } from "./server/manager"

interface Services {
  textGeneration: TextGenerationService
  imageToImage: ImageToImageService
  manager: ServerManager
}

/** Register all ipcMain handlers. Must run after app is ready. */
export function registerIpc(services: Services): void {
  const { textGeneration, imageToImage, manager } = services

  // --- Text generation ---
  ipcMain.handle(IPC.textGeneration.send, (_e, modelId: string, messages: LLMMessage[]) => textGeneration.send(modelId, messages))
  ipcMain.handle(IPC.textGeneration.abort, () => textGeneration.abort())

  // --- Image-to-image ---
  ipcMain.handle(IPC.imageToImage.run, (_e, modelId: string, input: ImagePayload) => imageToImage.run(modelId, input))

  // --- Models ---
  ipcMain.handle(IPC.models.list, () => manager.client.listModels())
  ipcMain.handle(IPC.models.pull, (_e, modelId: string, task: LlmTask) => manager.client.pullModel(modelId, task))

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
