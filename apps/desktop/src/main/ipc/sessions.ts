import { ipcMain } from "electron"
import { IPC } from "../../preload/ipc.ts"
import type { ChatSessionSaveRequest } from "../../renderer/src/types.ts"
import type { NyxServer } from "../server.ts"

export class Sessions {
  static register(server: NyxServer): void {
    ipcMain.handle(IPC.sessions.list, (_e, workspaceDir: string) => server.listSessions(workspaceDir))
    ipcMain.handle(IPC.sessions.get, (_e, workspaceDir: string, id: string) => server.getSession(workspaceDir, id))
    ipcMain.handle(IPC.sessions.save, (_e, session: ChatSessionSaveRequest) => server.saveSession(session))
    ipcMain.handle(IPC.sessions.rename, (_e, workspaceDir: string, id: string, title: string) =>
      server.renameSession(workspaceDir, id, title),
    )
    ipcMain.handle(IPC.sessions.setPinned, (_e, workspaceDir: string, id: string, pinned: boolean) =>
      server.setSessionPinned(workspaceDir, id, pinned),
    )
    ipcMain.handle(IPC.sessions.remove, (_e, workspaceDir: string, id: string) =>
      server.removeSession(workspaceDir, id),
    )
    ipcMain.handle(IPC.sessions.getActive, (_e, workspaceDir: string) => server.activeSessionId(workspaceDir))
    ipcMain.handle(IPC.sessions.setActive, (_e, workspaceDir: string, id: string | null) =>
      server.setActiveSessionId(workspaceDir, id),
    )
  }
}
