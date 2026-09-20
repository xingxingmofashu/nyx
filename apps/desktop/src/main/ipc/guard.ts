import { BrowserWindow, ipcMain, type IpcMainEvent, type IpcMainInvokeEvent } from "electron"

export class Guard {
  static handle<T extends unknown[]>(
    channel: string,
    listener: (event: IpcMainInvokeEvent, ...args: T) => unknown,
  ): void {
    ipcMain.handle(channel, (event, ...args) => {
      Guard.assert(event)
      return listener(event, ...(args as T))
    })
  }

  static on<T extends unknown[]>(channel: string, listener: (event: IpcMainEvent, ...args: T) => void): void {
    ipcMain.on(channel, (event, ...args) => {
      Guard.assert(event)
      listener(event, ...(args as T))
    })
  }

  private static assert(event: IpcMainInvokeEvent | IpcMainEvent): void {
    const frame = event.senderFrame
    if (!frame || frame.parent !== null) throw new Error("rejected ipc call from a sub-frame")
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win || win.isDestroyed()) throw new Error("rejected ipc call from an unknown window")
  }
}
