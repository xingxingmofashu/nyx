import { ipcMain } from "electron"
import { IPC } from "../../preload/ipc.ts"
import type { AttachmentInput } from "../../renderer/src/types.ts"
import type { NyxServer } from "../server.ts"

export class Files {
  static register(server: NyxServer): void {
    ipcMain.handle(IPC.files.readDataUrl, (_e, path: string) => server.readGeneratedFileDataUrl(path))
    ipcMain.handle(
      IPC.files.saveAttachment,
      (_e, input: AttachmentInput & { workspaceDir: string; sessionId: string }) =>
        server.saveAttachment({
          workspaceDir: input.workspaceDir,
          sessionId: input.sessionId,
          name: input.name,
          mimeType: input.mimeType,
          data: Buffer.from(input.data).toString("base64"),
        }),
    )
  }
}
