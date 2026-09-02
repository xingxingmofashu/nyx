import { create } from "zustand"
import type { ChatDisplayMessage } from "../../../shared/types"

interface ChatState {
  messages: ChatDisplayMessage[]
  isStreaming: boolean
  /** Append a message and return its id. */
  appendMessage: (role: "user" | "assistant") => string
  updateMessage: (id: string, patch: Partial<ChatDisplayMessage>) => void
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
      messages: state.messages.map((m) => (m.id === id ? { ...m, ...patch } : m)),
    })),
  setStreaming: (streaming) => set({ isStreaming: streaming }),
  reset: () => set({ messages: [], isStreaming: false }),
}))
