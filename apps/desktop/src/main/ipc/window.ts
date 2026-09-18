import { BrowserWindow, ipcMain } from "electron"
import { IPC } from "../../preload/ipc.ts"

export class Window {
  static register(): void {
    ipcMain.on(IPC.window.minimize, (e) => BrowserWindow.fromWebContents(e.sender)?.minimize())
    ipcMain.on(IPC.window.toggleMaximize, (e) => {
      const win = BrowserWindow.fromWebContents(e.sender)
      if (!win) return
      if (win.isMaximized()) win.unmaximize()
      else win.maximize()
    })
    ipcMain.on(IPC.window.close, (e) => BrowserWindow.fromWebContents(e.sender)?.close())
  }
}
