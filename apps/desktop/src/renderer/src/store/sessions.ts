import { create } from "zustand"
import type { ChatSessionMeta, ChatSessionSaveRequest } from "../../../shared/types"
import { agentChat } from "../lib/chat"
import { newSessionId, sessionTitle, messagesToMarkdown } from "../lib/sessions"
import { useAgentStore } from "./agent"

interface SessionsState {
  /** Saved sessions, newest first (pinned on top). */
  sessions: ChatSessionMeta[]
  /** Id of the open session; null for an unsaved ("draft") chat. */
  activeId: string | null
  /** True while a turn is streaming; switching sessions is disallowed then. */
  busy: boolean
  load: () => Promise<void>
  /** Open the last session the user had open, if any. */
  restoreLast: () => Promise<void>
  /** Start a fresh, unsaved chat. */
  create: () => Promise<void>
  open: (id: string) => Promise<void>
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
    set({ sessions: await window.nyx.sessions.list() })
  },

  restoreLast: async () => {
    const active = await window.nyx.sessions.getActive()
    if (active) await get().open(active)
  },

  create: async () => {
    if (get().busy) return
    agentChat.messages = []
    set({ activeId: null })
    await window.nyx.sessions.setActive(null)
  },

  open: async (id) => {
    if (get().busy) return
    const session = await window.nyx.sessions.get(id)
    if (!session) {
      await get().load()
      return
    }
    agentChat.messages = session.messages
    set({ activeId: id })
    await window.nyx.sessions.setActive(id)
  },

  rename: async (id, title) => {
    const meta = await window.nyx.sessions.rename(id, title)
    if (meta) await get().load()
  },

  setPinned: async (id, pinned) => {
    await window.nyx.sessions.setPinned(id, pinned)
    await get().load()
  },

  duplicate: async (id) => {
    const session = await window.nyx.sessions.get(id)
    if (!session) return
    await window.nyx.sessions.save({
      id: newSessionId(),
      title: `${session.title} (copy)`,
      ...(session.workspaceDir !== undefined ? { workspaceDir: session.workspaceDir } : {}),
      messages: session.messages,
    })
    await get().load()
  },

  remove: async (id) => {
    await window.nyx.sessions.remove(id)
    if (get().activeId === id) {
      agentChat.messages = []
      set({ activeId: null })
      await window.nyx.sessions.setActive(null)
    }
    await get().load()
  },

  exportSession: async (id) => {
    const session = await window.nyx.sessions.get(id)
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
    const { activeId, sessions } = get()
    const id = activeId ?? newSessionId()
    const existing = sessions.find((session) => session.id === id)
    const workspaceDir = useAgentStore.getState().workspaceDir
    const request: ChatSessionSaveRequest = {
      id,
      title: existing?.title ?? sessionTitle(messages),
      messages,
      ...(workspaceDir ? { workspaceDir } : {}),
    }
    await window.nyx.sessions.save(request)
    set({ activeId: id })
    await window.nyx.sessions.setActive(id)
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
