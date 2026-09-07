import { BrowserWindow, ipcMain } from "electron"
import { getModelsDir, getSettings, setSettings } from "@nyx/config"
import { IPC } from "../shared/ipc"
import type { LLMMessage, ImagePayload, LLMTask, Settings } from "../shared/types"
import { TextGenerationService } from "./services/text-generation"
import { ImageToImageService } from "./services/image-to-image"
import { ModelsService } from "./services/models"
import type { NyxServer } from "./server"

interface Services {
  tasks: {
    textGeneration: TextGenerationService
    imageToImage: ImageToImageService
  }
  models: ModelsService
  server: NyxServer
}

/** Register all ipcMain handlers. Must run after app is ready. */
export function registerIpc(services: Services): void {
  const {
    tasks: { textGeneration, imageToImage },
    models,
  } = services

  // --- Text generation ---
  ipcMain.handle(
    IPC.tasks.textGeneration.send,
    (_e, modelId: string, messages: LLMMessage[]) =>
      textGeneration.send(modelId, messages),
  )
  ipcMain.handle(IPC.tasks.textGeneration.abort, () => textGeneration.abort())

  // --- Image-to-image ---
  ipcMain.handle(
    IPC.tasks.imageToImage.run,
    (_e, modelId: string, input: ImagePayload) =>
      imageToImage.run(modelId, input),
  )

  // --- Models ---
  ipcMain.handle(IPC.models.list, () => models.list())
  ipcMain.handle(IPC.models.pull, (_e, modelId: string, task: LLMTask) =>
    models.pull(modelId, task),
  )
  ipcMain.handle(IPC.models.remove, (_e, modelId: string) =>
    models.remove(modelId),
  )

  // --- Config ---
  ipcMain.handle(IPC.config.getModelsDir, () => getModelsDir())
  ipcMain.handle(IPC.config.getSettings, () => getSettings())
  ipcMain.handle(IPC.config.setSettings, (_e, patch: Settings) => setSettings(patch))

  // --- Window controls (frameless) ---
  ipcMain.on(IPC.window.minimize, (e) =>
    BrowserWindow.fromWebContents(e.sender)?.minimize(),
  )
  ipcMain.on(IPC.window.toggleMaximize, (e) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    if (!win) return
    win.isMaximized() ? win.unmaximize() : win.maximize()
  })
  ipcMain.on(IPC.window.close, (e) =>
    BrowserWindow.fromWebContents(e.sender)?.close(),
  )
}
