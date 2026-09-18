import { create } from "zustand"
import { nanoid } from "nanoid"
import { messagesToMarkdown, sessionTitle } from "../lib/transcript"
import type { ChatSessionMeta, ChatSessionSaveRequest, CompactionResult, UIMessage } from "../types"
import { agentChat } from "../lib/chat"
import { useAgentStore } from "./agent"

interface SessionsState {
  /** Saved sessions of the active workspace (the sidebar lists them flat). */
  sessions: ChatSessionMeta[]
  /** Id of the open chat; a fresh id for an unsaved draft (names its audio). */
  activeId: string | null
  /** True while a turn is streaming; switching sessions is disallowed then. */
  busy: boolean
  /** True while a manual compaction is in flight. */
  compacting: boolean
  /** Post-compaction size estimate, shown until the next turn reports real usage. */
  contextOverride?: { tokens: number; forId: string }
  /** One-line result of the last manual compaction (e.g. nothing to summarize). */
  compactNotice?: string
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
  /** Summarize the transcript now, fold it into a checkpoint, and save. */
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
    // Both entry points ("Agent" in the sidebar, "New session" in the header)
    // start a clean slate, so a failed turn's error doesn't follow you over.
    agentChat.clearError()
    set({ activeId: nanoid() })
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
    const id = get().activeId ?? nanoid()
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

  compact: async () => {
    const empty: CompactionResult = { compacted: false }
    if (get().busy || get().compacting) return empty
    const messages = agentChat.messages
    if (messages.length === 0) return empty

    set({ compacting: true, compactNotice: undefined })
    try {
      const workspaceDir = useAgentStore.getState().workspaceDir
      const result = await window.nyx.chat.compact({
        messages,
        ...(workspaceDir ? { workspaceDir } : {}),
        sessionId: get().ensureId(),
      })
      const last = agentChat.messages[agentChat.messages.length - 1]
      if (result.compacted && result.checkpoint && last) {
        // Same spot a live turn puts it: the newest message's metadata, which
        // drives both the fold below it and the next request's transcript.
        const patched = {
          ...last,
          metadata: { ...((last.metadata as Record<string, unknown> | undefined) ?? {}), compaction: result.checkpoint },
        }
        agentChat.messages = [...agentChat.messages.slice(0, -1), patched]
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
            result.skipped === "too-short"
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

/**
 * Rescale the server's heuristic post-compaction estimate onto the provider's
 * own token scale, using the last reported input tokens as the baseline. Without
 * a baseline (no turn yet) the raw after-estimate is a fine placeholder.
 */
function scaleEstimate(result: CompactionResult, before: UIMessage[]): number | undefined {
  const after = result.estimatedTokens
  if (after === undefined) return undefined
  if (result.baselineTokens && result.baselineTokens > 0) {
    const reported = lastReportedTokens(before)
    if (reported !== undefined) return Math.max(0, Math.round((reported * after) / result.baselineTokens))
  }
  return after
}

/** Input tokens the provider reported for the most recent turn, if any. */
function lastReportedTokens(messages: UIMessage[]): number | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    const usage = (messages[i]?.metadata as { usage?: { inputTokens?: number } } | undefined)?.usage
    if (usage?.inputTokens) return usage.inputTokens
  }
  return undefined
}

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
    useSessionsStore.setState({
      busy: status === "submitted" || status === "streaming",
      // The last compaction's notice belongs to the turn it happened in.
      ...(status === "submitted" ? { compactNotice: undefined } : {}),
    })
    if (status === "ready" || status === "error") {
      void useSessionsStore.getState().persist()
    }
  })
}
