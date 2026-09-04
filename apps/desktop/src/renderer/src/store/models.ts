import { create } from "zustand"
import type { ModelInfo, LlmTask } from "../../../shared/types"

interface ModelsState {
  models: ModelInfo[]
  /** Selected model id per task. */
  selected: Partial<Record<LlmTask, string>>
  /** modelId → pull progress percent (undefined while idle). */
  pulling: Record<string, number | undefined>
  load: () => Promise<void>
  select: (task: LlmTask, modelId: string) => Promise<void>
  startPull: (modelId: string, task: LlmTask) => Promise<void>
  /** Update pull progress for one model. */
  updatePullProgress: (modelId: string, percent: number | undefined, done: boolean) => void
}

export const useModelsStore = create<ModelsState>((set, get) => ({
  models: [],
  selected: {},
  pulling: {},

  load: async () => {
    const models = await window.nyx.models.list()
    set({ models })
  },

  select: async (task, modelId) => {
    set((state) => ({ selected: { ...state.selected, [task]: modelId } }))
  },

  startPull: async (modelId, task) => {
    set((state) => ({ pulling: { ...state.pulling, [modelId]: 0 } }))
    try {
      await window.nyx.models.pull(modelId, task)
      await get().load()
    } finally {
      set((state) => {
        const next = { ...state.pulling }
        delete next[modelId]
        return { pulling: next }
      })
    }
  },

  updatePullProgress: (modelId, percent, done) => {
    if (done) {
      set((state) => {
        const next = { ...state.pulling }
        delete next[modelId]
        return { pulling: next }
      })
      return
    }
    set((state) => ({ pulling: { ...state.pulling, [modelId]: percent } }))
  },
}))
