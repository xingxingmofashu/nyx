import { app, BrowserWindow, shell } from "electron"
import { join } from "node:path"
import { registerIpc } from "./ipc"
import { AgentService } from "./agent-service"
import { ImageService } from "./image-service"
import { ServerClient } from "./server-client"
import { ServerManager } from "./server-manager"
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

const serverManager = new ServerManager()
const windows = new Set<BrowserWindow>()

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 640,
    title: "Nyx",
    backgroundColor: "#1a1a1e",
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
  win.webContents.on("console-message", (_e, level, message, line, sourceId) => {
    console.log(`[renderer:${level}] ${message} (${sourceId}:${line})`)
  })
  win.webContents.on("did-fail-load", (_e, code, desc, url) => {
    console.log(`[did-fail-load] ${code} ${desc} ${url}`)
  })

  const sendMaximized = () => win.webContents.send(IPC.window.maximized, win.isMaximized())
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
  // Start the inference server before any window can issue model calls.
  try {
    await serverManager.start()
  } catch (error) {
    console.error("failed to start nyx server:", error)
  }

  const client = new ServerClient(serverManager)
  const agentService = new AgentService(client)
  const imageService = new ImageService(client)
  registerIpc({ agent: agentService, image: imageService, client })

  const win = createWindow()
  agentService.attachWindow(win)

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      const w = createWindow()
      agentService.attachWindow(w)
    }
  })
})

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit()
})

// Stop the inference server when the app quits.
app.on("will-quit", () => {
  void serverManager.stop()
})
