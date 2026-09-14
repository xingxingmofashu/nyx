import { BrowserWindow, dialog, ipcMain } from "electron"
import { getModelsDir, getSettings, setSettings } from "@nyx/config"
import { IPC } from "../shared/ipc"
import type { ImageBytes, LLMTask, Settings, TextToAudioInput, ChatSendRequest } from "../shared/types"
import { ChatStreamService } from "./services/chat-stream"
import { ImageToImageService } from "./services/image-to-image"
import { TextToAudioService } from "./services/text-to-audio"
import { ModelsService } from "./services/models"
import type { NyxServerProcess } from "./server"

interface Services {
  tasks: {
    imageToImage: ImageToImageService
    textToAudio: TextToAudioService
  }
  chat: ChatStreamService
  models: ModelsService
  server: NyxServerProcess
}

/** Register all ipcMain handlers. Must run after app is ready. */
export function registerIpc(services: Services): void {
  const {
    tasks: { imageToImage, textToAudio },
    chat,
    models,
  } = services

  // --- Image-to-image ---
  ipcMain.handle(
    IPC.tasks.imageToImage.run,
    (_e, modelId: string, input: ImageBytes) =>
      imageToImage.run(modelId, input),
  )

  // --- Text-to-audio ---
  ipcMain.handle(
    IPC.tasks.textToAudio.run,
    (_e, modelId: string, input: TextToAudioInput) =>
      textToAudio.run(modelId, input),
  )

  // --- Chat (agent + local text generation) ---
  ipcMain.handle(IPC.chat.send, (_e, request: ChatSendRequest) =>
    chat.send(request),
  )
  ipcMain.handle(IPC.chat.abort, (_e, streamId: string) => chat.abort(streamId))

  // --- Models ---
  ipcMain.handle(IPC.models.list, () => models.list())
  ipcMain.handle(IPC.models.pull, (_e, modelId: string, task: LLMTask) =>
    models.pull(modelId, task),
  )
  ipcMain.handle(IPC.models.cancelPull, (_e, modelId: string) =>
    models.cancelPull(modelId),
  )
  ipcMain.handle(IPC.models.remove, (_e, modelId: string) =>
    models.remove(modelId),
  )

  // --- Config ---
  ipcMain.handle(IPC.config.getModelsDir, () => getModelsDir())
  ipcMain.handle(IPC.config.getSettings, () => getSettings())
  ipcMain.handle(IPC.config.setSettings, (_e, patch: Settings) => setSettings(patch))

  // --- Dialog ---
  ipcMain.handle(IPC.dialog.selectDirectory, async (e) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    const properties: Array<"openDirectory" | "createDirectory"> = ["openDirectory", "createDirectory"]
    const result = win
      ? await dialog.showOpenDialog(win, { properties })
      : await dialog.showOpenDialog({ properties })
    return result.canceled ? null : (result.filePaths[0] ?? null)
  })

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
