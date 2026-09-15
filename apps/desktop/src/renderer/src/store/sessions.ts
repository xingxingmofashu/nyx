import { create } from "zustand"
import { newId } from "@nyx/shared"
import { messagesToMarkdown, sessionTitle } from "@nyx/shared/chat"
import type { ChatSessionMeta, ChatSessionSaveRequest } from "../../../shared/types"
import { agentChat } from "../lib/chat"
import { useAgentStore } from "./agent"

interface SessionsState {
  /** Saved sessions of the active workspace (the sidebar lists them flat). */
  sessions: ChatSessionMeta[]
  /** Id of the open chat; a fresh id for an unsaved draft (names its audio). */
  activeId: string | null
  /** True while a turn is streaming; switching sessions is disallowed then. */
  busy: boolean
  load: () => Promise<void>
  /** Open the last session of `workspaceDir` the user had open, if any. */
  restoreLast: (workspaceDir: string) => Promise<void>
  /** Start a fresh, unsaved chat in the current workspace. */
  create: () => void
  open: (id: string) => Promise<void>
  /** Id of the current chat, generating one for an unsaved draft. */
  ensureId: () => string
  /** Rename a saved session. */
  rename: (id: string, title: string) => Promise<void>
  setPinned: (id: string, pinned: boolean) => Promise<void>
  duplicate: (id: string) => Promise<void>
  remove: (id: string) => Promise<void>
  /** Export a saved session as Markdown; resolves the saved path, or null. */
  exportSession: (id: string) => Promise<string | null>
  /** Persist the active transcript (no-op until it has a user message). */
  persist: () => Promise<void>
}

export const useSessionsStore = create<SessionsState>((set, get) => ({
  sessions: [],
  activeId: null,
  busy: false,

  load: async () => {
    // Chats created before a workspace is picked persist to the `_default`
    // workspace (workspaceDir ""), so list that rather than hiding them.
    const workspaceDir = useAgentStore.getState().workspaceDir
    set({ sessions: await window.nyx.sessions.list(workspaceDir) })
  },

  restoreLast: async (workspaceDir) => {
    const active = await window.nyx.sessions.getActive(workspaceDir)
    if (active) await get().open(active)
  },

  create: () => {
    if (get().busy) return
    agentChat.messages = []
    set({ activeId: newId() })
  },

  open: async (id) => {
    if (get().busy) return
    const meta = get().sessions.find((session) => session.id === id)
    if (!meta) {
      await get().load()
      return
    }
    const session = await window.nyx.sessions.get(meta.workspaceDir, id)
    if (!session) {
      await get().load()
      return
    }
    agentChat.messages = session.messages
    set({ activeId: id })
    await window.nyx.sessions.setActive(meta.workspaceDir, id)
  },

  ensureId: () => {
    const current = get().activeId
    if (current) return current
    const id = newId()
    set({ activeId: id })
    return id
  },

  rename: async (id, title) => {
    const meta = get().sessions.find((session) => session.id === id)
    if (!meta) return
    const next = await window.nyx.sessions.rename(meta.workspaceDir, id, title)
    if (next) await get().load()
  },

  setPinned: async (id, pinned) => {
    const meta = get().sessions.find((session) => session.id === id)
    if (!meta) return
    await window.nyx.sessions.setPinned(meta.workspaceDir, id, pinned)
    await get().load()
  },

  duplicate: async (id) => {
    const meta = get().sessions.find((session) => session.id === id)
    if (!meta) return
    const session = await window.nyx.sessions.get(meta.workspaceDir, id)
    if (!session) return
    await window.nyx.sessions.save({
      id: newId(),
      title: `${session.title} (copy)`,
      workspaceDir: meta.workspaceDir,
      messages: session.messages,
    })
    await get().load()
  },

  remove: async (id) => {
    const meta = get().sessions.find((session) => session.id === id)
    if (!meta) return
    await window.nyx.sessions.remove(meta.workspaceDir, id)
    if (get().activeId === id) {
      agentChat.messages = []
      set({ activeId: null })
      await window.nyx.sessions.setActive(meta.workspaceDir, null)
    }
    await get().load()
  },

  exportSession: async (id) => {
    const meta = get().sessions.find((session) => session.id === id)
    if (!meta) return null
    const session = await window.nyx.sessions.get(meta.workspaceDir, id)
    if (!session) return null
    const safeTitle = session.title.replace(/[\\/:*?"<>|]/g, "-") || "session"
    return window.nyx.dialog.saveFile({
      defaultPath: `${safeTitle}.md`,
      filters: [{ name: "Markdown", extensions: ["md"] }],
      content: messagesToMarkdown(session.messages),
    })
  },

  persist: async () => {
    const messages = agentChat.messages
    if (!messages.some((message) => message.role === "user")) return
    const id = get().activeId ?? newId()
    const existing = get().sessions.find((session) => session.id === id)
    const workspaceDir = useAgentStore.getState().workspaceDir
    const request: ChatSessionSaveRequest = {
      id,
      title: existing?.title ?? sessionTitle(messages),
      workspaceDir,
      messages,
    }
    await window.nyx.sessions.save(request)
    set({ activeId: id })
    await window.nyx.sessions.setActive(workspaceDir, id)
    await get().load()
  },
}))

let persistenceInitialized = false

/**
 * Persist the active transcript whenever a turn settles. Module-level (not a
 * hook) so a stream that finishes after the user leaves the Agent page is still
 * saved; the guard keeps React StrictMode from double-subscribing.
 */
export function initSessionPersistence(): void {
  if (persistenceInitialized) return
  persistenceInitialized = true
  agentChat["~registerStatusCallback"](() => {
    const status = agentChat.status
    useSessionsStore.setState({ busy: status === "submitted" || status === "streaming" })
    if (status === "ready" || status === "error") {
      void useSessionsStore.getState().persist()
    }
  })
}
