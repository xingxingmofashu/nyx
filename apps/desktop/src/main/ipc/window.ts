import { BrowserWindow } from "electron"
import { IPC } from "../../preload/ipc.ts"
import { Guard } from "./guard.ts"

export class Window {
  static register(): void {
    Guard.on(IPC.window.minimize, (e) => BrowserWindow.fromWebContents(e.sender)?.minimize())
    Guard.on(IPC.window.toggleMaximize, (e) => {
      const win = BrowserWindow.fromWebContents(e.sender)
      if (!win) return
      if (win.isMaximized()) win.unmaximize()
      else win.maximize()
    })
    Guard.on(IPC.window.close, (e) => BrowserWindow.fromWebContents(e.sender)?.close())
  }
}
