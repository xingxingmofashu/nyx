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
import { readFolderDocuments, readPickedDocuments, type ImportDocument } from "./knowledge-import"
import { readCatalogLimit } from "./model-limit"
import { listProviderModels } from "./provider-models"
import type {
  AgentProviderEntry,
  AttachmentInput,
  AudioSamples,
  AppEnvironment,
  ChatCompactRequest,
  ChatSendRequest,
  ChatSessionSaveRequest,
  ConfirmDialogRequest,
  ImageBytes,
  KnowledgeImportResult,
  LLMTask,
  SaveFileRequest,
  Settings,
  TextToSpeechInput,
} from "../shared/types"
import { ChatStreamService } from "./services/chat-stream"
import { ImageToImageService } from "./services/image-to-image"
import { AutomaticSpeechRecognitionService } from "./services/automatic-speech-recognition"
import { TextToSpeechService } from "./services/text-to-speech"
import { KnowledgeService } from "./services/knowledge"
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
  knowledge: KnowledgeService
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
    knowledge,
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
  ipcMain.handle(IPC.chat.compact, (_e, request: ChatCompactRequest) => chat.compact(request))

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

  // --- Knowledge base ---
  ipcMain.handle(IPC.knowledge.status, () => knowledge.status())
  ipcMain.handle(IPC.knowledge.list, () => knowledge.list())
  ipcMain.handle(IPC.knowledge.read, (_e, path: string) => knowledge.read(path))
  ipcMain.handle(IPC.knowledge.importFiles, async (e, target: string) => {
    const paths = await pickFiles(e)
    if (paths === null) return null
    return await importDocuments(e, knowledge, await readPickedDocuments(paths, target))
  })
  ipcMain.handle(IPC.knowledge.importFolder, async (e, target: string) => {
    const dir = await pickDirectory(e)
    if (dir === null) return null
    return await importDocuments(e, knowledge, await readFolderDocuments(dir, target))
  })
  ipcMain.handle(IPC.knowledge.remove, async (e, path: string) => {
    const confirmed = await confirm(e, {
      message: "Delete this document?",
      detail: `${path}\n\nThe file is removed from the knowledge base and its index entries are dropped.`,
      confirmLabel: "Delete",
    })
    if (!confirmed) return false
    await knowledge.remove(path)
    return true
  })
  ipcMain.handle(IPC.knowledge.index, (_e, rebuild: boolean) => knowledge.index(rebuild))
  ipcMain.handle(IPC.knowledge.cancelIndex, () => knowledge.cancelIndex())
  ipcMain.handle(IPC.knowledge.search, (_e, query: string, topK?: number) =>
    knowledge.search(query, topK),
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
  ipcMain.handle(IPC.config.modelLimits, (_e, providerId: string, modelId: string) =>
    readCatalogLimit(providerId, modelId),
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
  ipcMain.handle(IPC.dialog.selectDirectory, (e) => pickDirectory(e))
  ipcMain.handle(IPC.dialog.saveFile, async (e, request: SaveFileRequest) => {
    const win = windowFor(e)
    const options = { defaultPath: request.defaultPath, filters: request.filters }
    const result = win
      ? await dialog.showSaveDialog(win, options)
      : await dialog.showSaveDialog(options)
    if (result.canceled || !result.filePath) return null
    await writeFile(result.filePath, request.content, "utf8")
    return result.filePath
  })
  ipcMain.handle(IPC.dialog.confirm, (e, request: ConfirmDialogRequest) => confirm(e, request))

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

/** The window a renderer request came from, so dialogs are modal to it. */
function windowFor(e: Electron.IpcMainInvokeEvent): BrowserWindow | null {
  return BrowserWindow.fromWebContents(e.sender)
}

/** Native multi-select picker for Markdown files; null when cancelled. */
async function pickFiles(e: Electron.IpcMainInvokeEvent): Promise<string[] | null> {
  const properties: Array<"openFile" | "multiSelections"> = ["openFile", "multiSelections"]
  const options = { properties, filters: [{ name: "Markdown", extensions: ["md", "markdown"] }] }
  const win = windowFor(e)
  const result = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options)
  return result.canceled ? null : result.filePaths
}

/** Native folder picker; null when cancelled. */
async function pickDirectory(e: Electron.IpcMainInvokeEvent): Promise<string | null> {
  const properties: Array<"openDirectory" | "createDirectory"> = ["openDirectory", "createDirectory"]
  const win = windowFor(e)
  const result = win
    ? await dialog.showOpenDialog(win, { properties })
    : await dialog.showOpenDialog({ properties })
  return result.canceled ? null : (result.filePaths[0] ?? null)
}

/** Native yes/no confirmation; true when the user picks the affirmative button. */
async function confirm(e: Electron.IpcMainInvokeEvent, request: ConfirmDialogRequest): Promise<boolean> {
  const win = windowFor(e)
  const options: MessageBoxOptions = {
    type: "warning",
    buttons: [request.cancelLabel ?? "Cancel", request.confirmLabel ?? "Confirm"],
    defaultId: 0,
    cancelId: 0,
    noLink: true,
    message: request.message,
    detail: request.detail,
  }
  const result = win ? await dialog.showMessageBox(win, options) : await dialog.showMessageBox(options)
  return result.response === 1
}

/**
 * Copy read documents into the knowledge base. Existing paths are replaced only
 * after the user agrees — one prompt covers the whole batch; declining imports
 * the rest and leaves the existing files untouched.
 */
async function importDocuments(
  e: Electron.IpcMainInvokeEvent,
  knowledge: KnowledgeService,
  documents: ImportDocument[],
): Promise<KnowledgeImportResult> {
  if (documents.length === 0) return { written: [], overwritten: [], skipped: [] }
  const existing = new Set((await knowledge.list()).map((doc) => doc.file))
  const conflicts = documents.filter((doc) => existing.has(doc.path)).map((doc) => doc.path)
  const overwrite =
    conflicts.length === 0 ||
    (await confirm(e, {
      message: conflicts.length === 1 ? "This document already exists" : `${conflicts.length} documents already exist`,
      detail: `${previewPaths(conflicts)}\n\nOverwrite them, or skip them and import the rest?`,
      confirmLabel: "Overwrite",
      cancelLabel: "Skip",
    }))
  return await knowledge.import(documents, overwrite)
}

/** List conflicting paths for a dialog, capped so it stays readable. */
function previewPaths(paths: string[]): string {
  const shown = paths.slice(0, 10).join("\n")
  return paths.length > 10 ? `${shown}\n… and ${paths.length - 10} more` : shown
}
