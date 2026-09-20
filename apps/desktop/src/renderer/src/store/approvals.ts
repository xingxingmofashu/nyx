import { create } from "zustand"

interface ApprovalsState {
  always: Record<string, string[]>
  auto: Record<string, true>
  revoked: Record<string, true>
  mark: (sessionId: string, toolCallId: string) => void
  clear: (sessionId: string) => void
  request: (sessionId: string) => { always?: string[]; revoke?: boolean }
  consume: (sessionId: string) => void
}

export const useApprovalsStore = create<ApprovalsState>((set, get) => ({
  always: {},
  auto: {},
  revoked: {},

  mark: (sessionId, toolCallId) =>
    set((state) => {
      const ids = state.always[sessionId] ?? []
      return {
        always: {
          ...state.always,
          [sessionId]: ids.includes(toolCallId) ? ids : [...ids, toolCallId],
        },
        auto: { ...state.auto, [sessionId]: true },
      }
    }),

  clear: (sessionId) =>
    set((state) => {
      const always = { ...state.always }
      const auto = { ...state.auto }
      delete always[sessionId]
      delete auto[sessionId]
      return { always, auto, revoked: { ...state.revoked, [sessionId]: true } }
    }),

  request: (sessionId) => {
    const state = get()
    const ids = state.always[sessionId]
    return {
      ...(ids && ids.length > 0 ? { always: ids } : {}),
      ...(state.revoked[sessionId] ? { revoke: true } : {}),
    }
  },

  consume: (sessionId) =>
    set((state) => {
      if (!state.revoked[sessionId]) return state
      const revoked = { ...state.revoked }
      delete revoked[sessionId]
      return { revoked }
    }),
}))
