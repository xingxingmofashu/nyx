import { create } from "zustand"
import type { ModelInfo, ModelPullProgress, LLMTask } from "../../../shared/types"

/** Rich progress state for one in-flight download. */
export interface PullState {
  task: LLMTask
  file?: string
  loaded?: number
  total?: number
  percent?: number
}

interface ModelsState {
  models: ModelInfo[]
  /** Selected model id per task. */
  selected: Partial<Record<LLMTask, string>>
  /** modelId → detailed pull progress for in-flight downloads. */
  pulling: Record<string, PullState>
  /** modelId → most recent pull error message. */
  pullErrors: Record<string, string>
  load: () => Promise<void>
  select: (task: LLMTask, modelId: string) => Promise<void>
  startPull: (modelId: string, task: LLMTask) => Promise<void>
  /** Clear a pull error for one model. */
  clearPullError: (modelId: string) => void
  /** Merge a progress event into `pulling`. */
  updatePullProgress: (p: ModelPullProgress) => void
  /** Remove a model from disk; clears its selection when selected. */
  remove: (modelId: string) => Promise<void>
}

export const useModelsStore = create<ModelsState>((set, get) => ({
  models: [],
  selected: {},
  pulling: {},
  pullErrors: {},

  load: async () => {
    const models = await window.nyx.models.list()
    set({ models })
  },

  select: async (task, modelId) => {
    set((state) => ({ selected: { ...state.selected, [task]: modelId } }))
  },

  startPull: async (modelId, task) => {
    set((state) => {
      const { [modelId]: _gone, ...restErrors } = state.pullErrors
      return { pulling: { ...state.pulling, [modelId]: { task } }, pullErrors: restErrors }
    })
    try {
      await window.nyx.models.pull(modelId, task)
      await get().load()
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      set((state) => ({ pullErrors: { ...state.pullErrors, [modelId]: message } }))
    } finally {
      set((state) => {
        const next = { ...state.pulling }
        delete next[modelId]
        return { pulling: next }
      })
    }
  },

  clearPullError: (modelId) => {
    set((state) => {
      const { [modelId]: _gone, ...rest } = state.pullErrors
      return { pullErrors: rest }
    })
  },

  updatePullProgress: (p) => {
    if (p.done) {
      set((state) => {
        const next = { ...state.pulling }
        delete next[p.modelId]
        return { pulling: next }
      })
      return
    }
    const task = p.task ?? get().pulling[p.modelId]?.task ?? "text-generation"
    set((state) => {
      const current = state.pulling[p.modelId]
      return {
        pulling: {
          ...state.pulling,
          [p.modelId]: {
            task,
            file: p.file ?? current?.file,
            loaded: p.loaded ?? current?.loaded,
            total: p.total ?? current?.total,
            percent: p.percent ?? current?.percent,
          },
        },
      }
    })
  },

  remove: async (modelId) => {
    await window.nyx.models.remove(modelId)
    set((state) => {
      const selected = { ...state.selected }
      const task = (Object.keys(selected) as LLMTask[]).find((t) => selected[t] === modelId)
      if (task) delete selected[task]
      return { selected }
    })
    await get().load()
  },
}))
