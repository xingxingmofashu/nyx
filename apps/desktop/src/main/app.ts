import { app, BrowserWindow, session, shell, systemPreferences } from "electron"
import { join } from "node:path"
import { IPC } from "../preload/ipc.ts"
import { Ipc } from "./ipc/index.ts"
import { NyxServer } from "./server.ts"
import { Chat } from "./services/chat.ts"
import { Models } from "./services/models.ts"
import { Knowledge } from "./services/knowledge.ts"

export class App {
  private static readonly DEV_ICON = join(__dirname, "../../assets/light/icon.png")

  private readonly server = new NyxServer()
  private readonly chat = new Chat(this.server)
  private readonly models = new Models(this.server)
  private readonly knowledge = new Knowledge(this.server)

  start(): void {
    if (!app.requestSingleInstanceLock()) {
      app.quit()
      return
    }
    app.on("second-instance", () => this.focus())
    app.on("window-all-closed", () => {
      if (process.platform !== "darwin") app.quit()
    })
    app.on("will-quit", () => void this.server.stop())
    void app.whenReady().then(() => this.ready())
  }

  private async ready(): Promise<void> {
    if (!app.isPackaged && process.platform === "darwin") {
      app.dock?.setIcon(App.DEV_ICON)
    }
    await this.installPermissions()
    try {
      await this.server.start()
    } catch (error) {
      console.error("failed to start nyx server:", error)
    }
    Ipc.register({
      chat: this.chat,
      models: this.models,
      knowledge: this.knowledge,
      server: this.server,
    })
    this.openWindow()
    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) this.openWindow()
    })
  }

  private async installPermissions(): Promise<void> {
    session.defaultSession.setPermissionRequestHandler((_wc, permission, callback, details) => {
      if (permission === "media") {
        const mediaTypes = (details as { mediaTypes?: string[] } | undefined)?.mediaTypes ?? []
        callback(mediaTypes.length === 0 || mediaTypes.includes("audio"))
        return
      }
      callback(permission === "clipboard-sanitized-write" || permission === "clipboard-read")
    })
    session.defaultSession.setPermissionCheckHandler(
      (_wc, permission) => permission === "media" || permission.startsWith("clipboard"),
    )
    if (process.platform === "darwin") {
      const granted = await systemPreferences.askForMediaAccess("microphone")
      if (!granted) console.warn("microphone access was not granted")
    }
  }

  private openWindow(): BrowserWindow {
    const win = new BrowserWindow({
      width: 1280,
      height: 800,
      minWidth: 1080,
      minHeight: 700,
      title: "Nyx",
      backgroundColor: "#1a1a1e",
      ...(this.windowIcon ? { icon: this.windowIcon } : {}),
      webPreferences: {
        preload: join(__dirname, "preload.js"),
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
      },
    })

    win.webContents.setWindowOpenHandler(({ url }) => {
      void shell.openExternal(url)
      return { action: "deny" }
    })
    win.webContents.on("console-message", (_e, level, message, line, sourceId) => {
      console.log(`[renderer:${level}] ${message} (${sourceId}:${line})`)
    })
    win.webContents.on("did-fail-load", (_e, code, desc, url) => {
      console.log(`[did-fail-load] ${code} ${desc} ${url}`)
    })

    const sendMaximized = () => win.webContents.send(IPC.window.maximized, win.isMaximized())
    win.on("maximize", sendMaximized)
    win.on("unmaximize", sendMaximized)

    this.chat.attachWindow(win)
    this.models.attachWindow(win)
    this.knowledge.attachWindow(win)

    if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
      void win.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL)
    } else {
      void win.loadFile(join(__dirname, "../renderer/main_window/index.html"))
    }
    return win
  }

  private focus(): void {
    const win = BrowserWindow.getAllWindows()[0]
    if (!win) return
    if (win.isMinimized()) win.restore()
    win.focus()
  }

  private get windowIcon(): string | undefined {
    return !app.isPackaged && process.platform !== "darwin" ? App.DEV_ICON : undefined
  }
}
