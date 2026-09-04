import { BrowserWindow, ipcMain } from "electron"
import { getModelsDir } from "@nyx/config"
import { IPC } from "../shared/ipc"
import type { LLMMessage, ImagePayload, LlmTask } from "../shared/types"
import { TextGenerationService } from "./services/text-generation"
import { ImageToImageService } from "./services/image-to-image"
import type { NyxServer } from "./server"

interface Services {
  tasks: {
    textGeneration: TextGenerationService
    imageToImage: ImageToImageService
  }
  server: NyxServer
}

/** Register all ipcMain handlers. Must run after app is ready. */
export function registerIpc(services: Services): void {
  const {
    tasks: { textGeneration, imageToImage },
    server,
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
  ipcMain.handle(IPC.models.list, () => server.client.listModels())
  ipcMain.handle(IPC.models.pull, (_e, modelId: string, task: LlmTask) =>
    server.client.pullModel(modelId, task),
  )

  // --- Config ---
  ipcMain.handle(IPC.config.getModelsDir, () => getModelsDir())

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
