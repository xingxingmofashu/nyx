import { BrowserWindow, dialog, ipcMain } from "electron"
import { writeFile } from "node:fs/promises"
import {
  getActiveSessionId,
  getModelsDir,
  getSession,
  getSettings,
  listSessions,
  removeSession,
  renameSession,
  saveSession,
  setActiveSessionId,
  setSessionPinned,
  setSettings,
} from "@nyx/config"
import { IPC } from "../shared/ipc"
import { readGeneratedFileDataUrl } from "./lib/generated-file"
import type {
  AudioSamples,
  ChatSendRequest,
  ChatSessionSaveRequest,
  ImageBytes,
  LLMTask,
  SaveFileRequest,
  Settings,
  TextToSpeechInput,
} from "../shared/types"
import { ChatStreamService } from "./services/chat-stream"
import { ImageToImageService } from "./services/image-to-image"
import { AutomaticSpeechRecognitionService } from "./services/automatic-speech-recognition"
import { TextToSpeechService } from "./services/text-to-speech"
import { ModelsService } from "./services/models"
import type { NyxServerProcess } from "./server"

interface Services {
  tasks: {
    imageToImage: ImageToImageService
    textToSpeech: TextToSpeechService
    automaticSpeechRecognition: AutomaticSpeechRecognitionService
  }
  chat: ChatStreamService
  models: ModelsService
  server: NyxServerProcess
}

/** Register all ipcMain handlers. Must run after app is ready. */
export function registerIpc(services: Services): void {
  const {
    tasks: { imageToImage, textToSpeech, automaticSpeechRecognition },
    chat,
    models,
  } = services

  // --- Image-to-image ---
  ipcMain.handle(
    IPC.tasks.imageToImage.run,
    (_e, modelId: string, input: ImageBytes) =>
      imageToImage.run(modelId, input),
  )

  // --- Text-to-speech ---
  ipcMain.handle(
    IPC.tasks.textToSpeech.run,
    (_e, modelId: string, input: TextToSpeechInput) =>
      textToSpeech.run(modelId, input),
  )

  // --- Automatic speech recognition ---
  ipcMain.handle(
    IPC.tasks.automaticSpeechRecognition.run,
    (_e, modelId: string, input: AudioSamples) =>
      automaticSpeechRecognition.run(modelId, input),
  )

  // --- Agent chat ---
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

  // --- Sessions ---
  ipcMain.handle(IPC.sessions.list, () => listSessions())
  ipcMain.handle(IPC.sessions.get, (_e, workspaceDir: string, id: string) =>
    getSession(workspaceDir, id) ?? null,
  )
  ipcMain.handle(IPC.sessions.save, (_e, session: ChatSessionSaveRequest) => saveSession(session))
  ipcMain.handle(IPC.sessions.rename, (_e, workspaceDir: string, id: string, title: string) =>
    renameSession(workspaceDir, id, title) ?? null,
  )
  ipcMain.handle(IPC.sessions.setPinned, (_e, workspaceDir: string, id: string, pinned: boolean) =>
    setSessionPinned(workspaceDir, id, pinned) ?? null,
  )
  ipcMain.handle(IPC.sessions.remove, (_e, workspaceDir: string, id: string) => {
    removeSession(workspaceDir, id)
  })
  ipcMain.handle(IPC.sessions.getActive, (_e, workspaceDir: string) =>
    getActiveSessionId(workspaceDir) ?? null,
  )
  ipcMain.handle(IPC.sessions.setActive, (_e, workspaceDir: string, id: string | null) => {
    setActiveSessionId(workspaceDir, id)
  })

  // --- Dialog ---
  ipcMain.handle(IPC.dialog.selectDirectory, async (e) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    const properties: Array<"openDirectory" | "createDirectory"> = ["openDirectory", "createDirectory"]
    const result = win
      ? await dialog.showOpenDialog(win, { properties })
      : await dialog.showOpenDialog({ properties })
    return result.canceled ? null : (result.filePaths[0] ?? null)
  })
  ipcMain.handle(IPC.dialog.saveFile, async (e, request: SaveFileRequest) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    const options = { defaultPath: request.defaultPath, filters: request.filters }
    const result = win
      ? await dialog.showSaveDialog(win, options)
      : await dialog.showSaveDialog(options)
    if (result.canceled || !result.filePath) return null
    await writeFile(result.filePath, request.content, "utf8")
    return result.filePath
  })

  // --- Files ---
  ipcMain.handle(IPC.files.readDataUrl, (_e, path: string) => readGeneratedFileDataUrl(path))

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
