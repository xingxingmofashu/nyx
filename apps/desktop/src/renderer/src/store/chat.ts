import { create } from "zustand"
import type { ChatDisplayMessage, ChatMessage } from "../../../shared/types"

/** Result of a successful user-text append. */
export interface SendResult {
  /** id of the appended user message (empty when the send was a no-op). */
  messageId: string
  /** The text-transcript to send to the server, mirroring the new state. */
  transcript: ChatMessage[]
}

interface ChatState {
  messages: ChatDisplayMessage[]
  isStreaming: boolean
  /** Append a message and return its id. */
  appendMessage: (role: "user" | "assistant") => string
  /** Update a message; patch.text may be a function receiving the current text. */
  updateMessage: (id: string, patch: Partial<ChatDisplayMessage> | ((m: ChatDisplayMessage) => Partial<ChatDisplayMessage>)) => void
  /**
   * Append a user message with its text and return the transcript that
   * mirrors the resulting state, so a caller can send it to the server
   * without racing the immutable store update.
   */
  appendUserMessage: (text: string) => SendResult
  setStreaming: (streaming: boolean) => void
  reset: () => void
}

let nextId = 1

export const useChatStore = create<ChatState>((set) => ({
  messages: [],
  isStreaming: false,
  appendMessage: (role) => {
    const id = `msg-${nextId++}`
    const message: ChatDisplayMessage = { id, role, text: "", streaming: role === "assistant" }
    set((state) => ({ messages: [...state.messages, message] }))
    return id
  },
  updateMessage: (id, patch) =>
    set((state) => ({
      messages: state.messages.map((m) => {
        if (m.id !== id) return m
        const resolved = typeof patch === "function" ? patch(m) : patch
        return { ...m, ...resolved }
      }),
    })),
  appendUserMessage: (text) => {
    const id = `msg-${nextId++}`
    const message: ChatDisplayMessage = { id, role: "user", text }
    let transcript: ChatMessage[] = []
    set((state) => {
      const messages = [...state.messages, message]
      transcript = messages.map((m) => ({ role: m.role, content: m.text }))
      return { messages }
    })
    return { messageId: id, transcript }
  },
  setStreaming: (streaming) => set({ isStreaming: streaming }),
  reset: () => set({ messages: [], isStreaming: false }),
}))
