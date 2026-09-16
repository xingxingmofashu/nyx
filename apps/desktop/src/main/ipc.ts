import { BrowserWindow, dialog, ipcMain, type MessageBoxOptions } from "electron"
import { writeFile } from "node:fs/promises"
import {
  getActiveSessionId,
  getKnowledgeDir,
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
  writeSettings,
} from "@nyx/config"
import { IPC } from "../shared/ipc"
import { saveAttachment } from "./attachment"
import { readGeneratedFileDataUrl } from "./generated-file"
import { listProviderModels } from "./provider-models"
import type {
  AgentProviderEntry,
  AttachmentInput,
  AudioSamples,
  AppEnvironment,
  ChatSendRequest,
  ChatSessionSaveRequest,
  ConfirmDialogRequest,
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

/** Env vars the server reads that take precedence over settings.json. */
const ENV_OVERRIDE_KEYS = [
  "NYX_AGENT_MODEL",
  "NYX_AGENT_API_KEY",
  "NYX_AGENT_BASE_URL",
  "NYX_AGENT_HEADERS",
  "NYX_AGENT_LOCAL_MODELS",
  "NYX_AGENT_WEB_SEARCH",
  "NYX_WEB_SEARCH_PROVIDER",
  "NYX_WEB_SEARCH_API_KEY",
  "NYX_PARALLEL_API_KEY",
  "HF_ENDPOINT",
] as const

/** Register all ipcMain handlers. Must run after app is ready. */
export function registerIpc(services: Services): void {
  const {
    tasks: { imageToImage, textToSpeech, automaticSpeechRecognition },
    chat,
    models,
    server,
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
  ipcMain.handle(IPC.config.writeSettings, (_e, settings: Settings) => writeSettings(settings))
  ipcMain.handle(IPC.config.getEnvironment, (): AppEnvironment => ({
    modelsDir: getModelsDir(),
    knowledgeDir: getKnowledgeDir(),
    // The server reads these from its own env, which beats settings.json.
    envOverrides: ENV_OVERRIDE_KEYS.filter((key) => Boolean(process.env[key])),
  }))
  ipcMain.handle(IPC.config.listModels, (_e, provider: AgentProviderEntry) =>
    listProviderModels(provider),
  )
  ipcMain.handle(IPC.config.restartServer, async () => {
    await server.stop()
    await server.start()
  })

  // --- Sessions ---
  ipcMain.handle(IPC.sessions.list, (_e, workspaceDir: string) => listSessions(workspaceDir))
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
  ipcMain.handle(IPC.dialog.confirm, async (e, request: ConfirmDialogRequest) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    const options: MessageBoxOptions = {
      type: "warning",
      buttons: [request.cancelLabel ?? "Cancel", request.confirmLabel ?? "Confirm"],
      defaultId: 0,
      cancelId: 0,
      noLink: true,
      message: request.message,
      detail: request.detail,
    }
    const result = win
      ? await dialog.showMessageBox(win, options)
      : await dialog.showMessageBox(options)
    return result.response === 1
  })

  // --- Files ---
  ipcMain.handle(IPC.files.readDataUrl, (_e, path: string) => readGeneratedFileDataUrl(path))
  ipcMain.handle(
    IPC.files.saveAttachment,
    (_e, input: AttachmentInput & { workspaceDir: string; sessionId: string }) => saveAttachment(input),
  )

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
