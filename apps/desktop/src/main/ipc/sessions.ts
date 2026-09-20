import { IPC } from "../../preload/ipc.ts"
import type { ChatSessionSaveRequest } from "../../renderer/src/types.ts"
import type { NyxServer } from "../server.ts"
import { Guard } from "./guard.ts"

export class Sessions {
  static register(server: NyxServer): void {
    Guard.handle(IPC.sessions.list, (_e, workspaceDir: string) => server.listSessions(workspaceDir))
    Guard.handle(IPC.sessions.get, (_e, workspaceDir: string, id: string) => server.getSession(workspaceDir, id))
    Guard.handle(IPC.sessions.save, (_e, session: ChatSessionSaveRequest) => server.saveSession(session))
    Guard.handle(IPC.sessions.rename, (_e, workspaceDir: string, id: string, title: string) =>
      server.renameSession(workspaceDir, id, title),
    )
    Guard.handle(IPC.sessions.setPinned, (_e, workspaceDir: string, id: string, pinned: boolean) =>
      server.setSessionPinned(workspaceDir, id, pinned),
    )
    Guard.handle(IPC.sessions.remove, (_e, workspaceDir: string, id: string) =>
      server.removeSession(workspaceDir, id),
    )
    Guard.handle(IPC.sessions.getActive, (_e, workspaceDir: string) => server.activeSessionId(workspaceDir))
    Guard.handle(IPC.sessions.setActive, (_e, workspaceDir: string, id: string | null) =>
      server.setActiveSessionId(workspaceDir, id),
    )
  }
}
