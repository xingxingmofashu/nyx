import { app, BrowserWindow, session, shell, systemPreferences } from "electron"
import { join } from "node:path"
import { registerIpc } from "./ipc"
import { ChatStreamService } from "./services/chat-stream"
import { ImageToImageService } from "./services/image-to-image"
import { AutomaticSpeechRecognitionService } from "./services/automatic-speech-recognition"
import { TextToSpeechService } from "./services/text-to-speech"
import { ModelsService } from "./services/models"
import { KnowledgeService } from "./services/knowledge"
import { NyxServerProcess } from "./server"
import { IPC } from "../shared/ipc"

// Single instance: local model cache is a single set of files.
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on("second-instance", () => {
    const win = BrowserWindow.getAllWindows()[0]
    if (win) {
      if (win.isMinimized()) win.restore()
      win.focus()
    }
  })
}

const server = new NyxServerProcess()
const windows = new Set<BrowserWindow>()

// `assets/` is excluded from the asar, so this source path only exists in dev.
// Packaged builds get their icon from `packagerConfig.icon` at bundle time (the
// .icns on macOS, the .ico rcedit'd into the Windows exe).
const devIcon = join(__dirname, "../../assets/light/icon.png")
const windowIcon = !app.isPackaged && process.platform !== "darwin" ? devIcon : undefined

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 640,
    title: "Nyx",
    backgroundColor: "#1a1a1e",
    ...(windowIcon ? { icon: windowIcon } : {}),
    // Frameless: the renderer header provides the drag region and controls.
    frame: false,
    webPreferences: {
      preload: join(__dirname, "preload.js"),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  windows.add(win)
  win.on("closed", () => windows.delete(win))

  // Open external links in the system browser, never in-app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: "deny" }
  })

  // Debug: surface renderer console + load failures to stdout.
  win.webContents.on(
    "console-message",
    (_e, level, message, line, sourceId) => {
      console.log(`[renderer:${level}] ${message} (${sourceId}:${line})`)
    },
  )
  win.webContents.on("did-fail-load", (_e, code, desc, url) => {
    console.log(`[did-fail-load] ${code} ${desc} ${url}`)
  })

  const sendMaximized = () =>
    win.webContents.send(IPC.window.maximized, win.isMaximized())
  win.on("maximize", sendMaximized)
  win.on("unmaximize", sendMaximized)

  // Electron Forge plugin-vite injects this as a compile-time define.
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    win.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL)
  } else {
    win.loadFile(join(__dirname, "../renderer/main_window/index.html"))
  }
  return win
}

app.whenReady().then(async () => {
  // In dev the app still shows Electron's own icon; use the real one so the
  // dock matches packaged builds. (Packaged apps read it from the bundle.)
  if (!app.isPackaged && process.platform === "darwin") {
    app.dock?.setIcon(devIcon)
  }

  // Voice input needs the microphone: prompt for the macOS system permission
  // and let the renderer's `getUserMedia` through (audio only, plus clipboard
  // for copy actions).
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback, details) => {
    if (permission === "media") {
      const mediaTypes = (details as { mediaTypes?: string[] } | undefined)?.mediaTypes ?? []
      callback(mediaTypes.length === 0 || mediaTypes.includes("audio"))
      return
    }
    callback(permission === "clipboard-sanitized-write" || permission === "clipboard-read")
  })
  session.defaultSession.setPermissionCheckHandler((_wc, permission) =>
    permission === "media" || permission.startsWith("clipboard"),
  )
  if (process.platform === "darwin") {
    const granted = await systemPreferences.askForMediaAccess("microphone")
    if (!granted) console.warn("microphone access was not granted")
  }

  // Start the inference server before any window can issue model calls.
  try {
    await server.start()
  } catch (error) {
    console.error("failed to start nyx server:", error)
  }

  const chatService = new ChatStreamService(server)
  const imageToImageService = new ImageToImageService(server)
  const textToSpeechService = new TextToSpeechService(server)
  const automaticSpeechRecognitionService = new AutomaticSpeechRecognitionService(server)
  const modelsService = new ModelsService(server)
  const knowledgeService = new KnowledgeService(server)
  registerIpc({
    tasks: {
      imageToImage: imageToImageService,
      textToSpeech: textToSpeechService,
      automaticSpeechRecognition: automaticSpeechRecognitionService,
    },
    chat: chatService,
    models: modelsService,
    knowledge: knowledgeService,
    server: server,
  })

  const win = createWindow()
  chatService.attachWindow(win)
  modelsService.attachWindow(win)
  knowledgeService.attachWindow(win)

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      const w = createWindow()
      chatService.attachWindow(w)
      modelsService.attachWindow(w)
      knowledgeService.attachWindow(w)
    }
  })
})

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit()
})

// Stop the inference server when the app quits.
app.on("will-quit", () => {
  void server.stop()
})
