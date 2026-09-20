import { create } from "zustand"

interface ApprovalsState {
  auto: Record<string, true>
  revoked: Record<string, true>
  allow: (sessionId: string) => void
  clear: (sessionId: string) => void
  request: (sessionId: string) => { allowAll?: boolean; revoke?: boolean }
  consume: (sessionId: string) => void
}

export const useApprovalsStore = create<ApprovalsState>((set, get) => ({
  auto: {},
  revoked: {},

  allow: (sessionId) =>
    set((state) =>
      state.auto[sessionId] ? state : { auto: { ...state.auto, [sessionId]: true } },
    ),

  clear: (sessionId) =>
    set((state) => {
      const auto = { ...state.auto }
      delete auto[sessionId]
      return { auto, revoked: { ...state.revoked, [sessionId]: true } }
    }),

  request: (sessionId) => ({
    ...(get().auto[sessionId] ? { allowAll: true } : {}),
    ...(get().revoked[sessionId] ? { revoke: true } : {}),
  }),

  consume: (sessionId) =>
    set((state) => {
      if (!state.revoked[sessionId]) return state
      const revoked = { ...state.revoked }
      delete revoked[sessionId]
      return { revoked }
    }),
}))
