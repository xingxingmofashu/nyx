import { create } from "zustand"
import { nanoid } from "nanoid"
import { messagesToMarkdown, sessionTitle, settledMessages } from "../lib/transcript"
import type { ChatSessionMeta, ChatSessionSaveRequest, CompactionResult, UIMessage } from "../types"
import { agentChat } from "../lib/chat"
import { useAgentStore } from "./agent"

interface SessionsState {
  
  sessions: ChatSessionMeta[]
  
  activeId: string | null
  
  busy: boolean
  
  compacting: boolean
  
  contextOverride?: { tokens: number; forId: string }
  
  compactNotice?: string
  load: () => Promise<void>
  
  restoreLast: (workspaceDir: string) => Promise<void>
  
  create: () => void
  open: (id: string) => Promise<void>
  
  ensureId: () => string
  
  rename: (id: string, title: string) => Promise<void>
  setPinned: (id: string, pinned: boolean) => Promise<void>
  duplicate: (id: string) => Promise<void>
  remove: (id: string) => Promise<void>
  
  exportSession: (id: string) => Promise<string | null>
  
  persist: () => Promise<void>
  
  compact: () => Promise<CompactionResult>
}

export const useSessionsStore = create<SessionsState>((set, get) => ({
  sessions: [],
  activeId: null,
  busy: false,
  compacting: false,
  contextOverride: undefined,
  compactNotice: undefined,

  load: async () => {
    const workspaceDir = useAgentStore.getState().workspaceDir
    if (!workspaceDir) {
      set({ sessions: [] })
      return
    }
    set({ sessions: await window.nyx.sessions.list(workspaceDir) })
  },

  restoreLast: async (workspaceDir) => {
    if (!workspaceDir) return
    const active = await window.nyx.sessions.getActive(workspaceDir)
    if (active) await get().open(active)
  },

  create: () => {
    if (get().busy || get().compacting) return
    agentChat.messages = []
    
    
    agentChat.clearError()
    set({ activeId: nanoid(), contextOverride: undefined })
  },

  open: async (id) => {
    if (get().busy || get().compacting) return
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
    set({ activeId: id, contextOverride: undefined })
    await window.nyx.sessions.setActive(meta.workspaceDir, id)
  },

  ensureId: () => {
    const current = get().activeId
    if (current) return current
    const id = nanoid()
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
      id: nanoid(),
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
    persistedSnapshots.delete(id)
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
    const settled = settledMessages(agentChat.messages)
    if (settled.some((message, index) => message !== agentChat.messages[index])) {
      agentChat.messages = settled
    }
    const messages = settled
    if (!messages.some((message) => message.role === "user")) return
    const workspaceDir = useAgentStore.getState().workspaceDir
    if (!workspaceDir) return
    const id = get().activeId ?? nanoid()
    const existing = get().sessions.find((session) => session.id === id)
    const title = existing?.title ?? sessionTitle(messages)
    const request: ChatSessionSaveRequest = {
      id,
      title,
      workspaceDir,
      messages,
    }
    const serialized = JSON.stringify(messages)
    if (persistedSnapshots.get(id) !== serialized) {
      await window.nyx.sessions.save(request)
      persistedSnapshots.set(id, serialized)
    }
    set({ activeId: id })
    await window.nyx.sessions.setActive(workspaceDir, id)
    if (!existing || existing.title !== title) await get().load()
  },

  compact: async () => {
    const empty: CompactionResult = { compacted: false }
    if (get().busy || get().compacting) return empty
    const messages = agentChat.messages
    const targetId = messages[messages.length - 1]?.id
    if (messages.length === 0 || !targetId) return empty

    const sessionId = get().ensureId()
    set({ compacting: true, compactNotice: undefined })
    try {
      const workspaceDir = useAgentStore.getState().workspaceDir
      const result = await window.nyx.chat.compact({
        messages,
        ...(workspaceDir ? { workspaceDir } : {}),
        sessionId,
      })
      if (get().activeId !== sessionId) {
        set({ compactNotice: "Compaction skipped — the active chat changed." })
        return result
      }
      const current = agentChat.messages
      const last = current[current.length - 1]
      if (!last || last.id !== targetId) {
        set({ compactNotice: "Compaction skipped — the transcript changed." })
        return result
      }
      if (result.compacted && result.checkpoint) {
        
        
        const patched = {
          ...last,
          metadata: { ...(last.metadata as Record<string, unknown> | undefined), compaction: result.checkpoint },
        }
        agentChat.messages = [...current.slice(0, -1), patched]
        const tokens = scaleEstimate(result, messages)
        set({
          contextOverride: tokens === undefined ? undefined : { tokens, forId: patched.id },
          compactNotice: "Context compacted.",
        })
        await get().persist()
      } else {
        set({
          contextOverride: undefined,
          compactNotice:
            result.error !== undefined
              ? `Compaction failed: ${result.error}`
              : result.skipped === "too-short"
                ? "Nothing new to compact — everything older is already summarized."
                : undefined,
        })
      }
      return result
    } catch (error) {
      set({ compactNotice: error instanceof Error ? error.message : "Compaction failed." })
      return empty
    } finally {
      set({ compacting: false })
    }
  },
}))

function scaleEstimate(result: CompactionResult, before: UIMessage[]): number | undefined {
  const after = result.estimatedTokens
  if (after === undefined) return undefined
  if (result.baselineTokens && result.baselineTokens > 0) {
    const reported = lastReportedTokens(before)
    if (reported !== undefined) return Math.max(0, Math.round((reported * after) / result.baselineTokens))
  }
  return after
}

function lastReportedTokens(messages: UIMessage[]): number | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    const usage = (messages[i]?.metadata as { usage?: { inputTokens?: number } } | undefined)?.usage
    if (usage?.inputTokens) return usage.inputTokens
  }
  return undefined
}

const persistedSnapshots = new Map<string, string>()

let persistenceInitialized = false

export function initSessionPersistence(): void {
  if (persistenceInitialized) return
  persistenceInitialized = true
  agentChat["~registerStatusCallback"](() => {
    const status = agentChat.status
    useSessionsStore.setState({
      busy: status === "submitted" || status === "streaming",
      
      ...(status === "submitted" ? { compactNotice: undefined } : {}),
    })
    if (status === "ready" || status === "error") {
      void useSessionsStore.getState().persist()
    }
  })
}
