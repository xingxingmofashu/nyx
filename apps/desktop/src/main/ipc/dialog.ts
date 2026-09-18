import { BrowserWindow, dialog, ipcMain, type MessageBoxOptions } from "electron"
import { writeFile } from "node:fs/promises"
import { IPC } from "../../preload/ipc.ts"
import type { ConfirmDialogRequest, SaveFileRequest } from "../../renderer/src/types.ts"

export class Dialog {
  private static readonly MARKDOWN_FILTERS = [{ name: "Markdown", extensions: ["md", "markdown"] }]

  static register(): void {
    ipcMain.handle(IPC.dialog.selectDirectory, (e) => Dialog.pickDirectory(e))
    ipcMain.handle(IPC.dialog.saveFile, async (e, request: SaveFileRequest) => {
      const win = BrowserWindow.fromWebContents(e.sender)
      const options = { defaultPath: request.defaultPath, filters: request.filters }
      const result = win ? await dialog.showSaveDialog(win, options) : await dialog.showSaveDialog(options)
      if (result.canceled || !result.filePath) return null
      await writeFile(result.filePath, request.content, "utf8")
      return result.filePath
    })
    ipcMain.handle(IPC.dialog.confirm, (e, request: ConfirmDialogRequest) => Dialog.confirm(e, request))
  }

  static async pickFiles(e: Electron.IpcMainInvokeEvent): Promise<string[] | null> {
    const properties: Array<"openFile" | "multiSelections"> = ["openFile", "multiSelections"]
    const options = { properties, filters: Dialog.MARKDOWN_FILTERS }
    const win = BrowserWindow.fromWebContents(e.sender)
    const result = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options)
    return result.canceled ? null : result.filePaths
  }

  static async pickDirectory(e: Electron.IpcMainInvokeEvent): Promise<string | null> {
    const properties: Array<"openDirectory" | "createDirectory"> = ["openDirectory", "createDirectory"]
    const win = BrowserWindow.fromWebContents(e.sender)
    const result = win ? await dialog.showOpenDialog(win, { properties }) : await dialog.showOpenDialog({ properties })
    return result.canceled ? null : (result.filePaths[0] ?? null)
  }

  static async confirm(e: Electron.IpcMainInvokeEvent, request: ConfirmDialogRequest): Promise<boolean> {
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
    const result = win ? await dialog.showMessageBox(win, options) : await dialog.showMessageBox(options)
    return result.response === 1
  }
}
