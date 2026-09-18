import { create } from "zustand"
import type { ModelInfo, ModelPullProgress, LLMTask } from "../types"

/** Rich progress state for one in-flight download. */
export interface PullState {
  task: LLMTask
  file?: string
  loaded?: number
  total?: number
  percent?: number
  /** True once the user asked to cancel but the server hasn't confirmed yet. */
  cancelling?: boolean
}

interface ModelsState {
  models: ModelInfo[]
  /** Selected model id per task. */
  selected: Partial<Record<LLMTask, string>>
  /** modelId → detailed pull progress for in-flight downloads. */
  pulling: Record<string, PullState>
  load: () => Promise<void>
  select: (task: LLMTask, modelId: string) => Promise<void>
  startPull: (modelId: string, task: LLMTask) => Promise<void>
  /** Ask the server to stop an in-flight pull. */
  cancelPull: (modelId: string) => Promise<void>
  /** Merge a progress event into `pulling`. */
  updatePullProgress: (p: ModelPullProgress) => void
  /** Remove a model from disk; clears its selection when selected. */
  remove: (modelId: string) => Promise<void>
}

export const useModelsStore = create<ModelsState>((set, get) => ({
  models: [],
  selected: {},
  pulling: {},

  load: async () => {
    const models = await window.nyx.models.list()
    set((state) => {
      // Default each task to its first installed model so the pickers (and the
      // agent composer mic) work without an explicit selection.
      const selected = { ...state.selected }
      for (const model of models) {
        // Registry tasks are always our LLMTask ids (ModelInfo.task is the wider
        // transformers.js PipelineType).
        const task = model.task as LLMTask
        if (!selected[task]) selected[task] = model.id
      }
      return { models, selected }
    })
  },

  select: async (task, modelId) => {
    set((state) => ({ selected: { ...state.selected, [task]: modelId } }))
  },

  startPull: async (modelId, task) => {
    set((state) => ({ pulling: { ...state.pulling, [modelId]: { task } } }))
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

  cancelPull: async (modelId) => {
    // If the row is already gone the pull ended (success or terminal event); a
    // cancel then is moot, so don't recreate a phantom row.
    set((state) => {
      const current = state.pulling[modelId]
      if (!current) return {}
      return {
        pulling: {
          ...state.pulling,
          [modelId]: { ...current, cancelling: true },
        },
      }
    })
    try {
      const cancelled = await window.nyx.models.cancelPull(modelId)
      if (cancelled) {
        // The server aborted the pull. Drop the row now rather than waiting for
        // the SSE terminal event: transformers.js can't interrupt a fetch in
        // flight, so that event may lag (or never come on a hung connection).
        // Terminal events below only ever delete rows, never re-add.
        set((state) => {
          const next = { ...state.pulling }
          delete next[modelId]
          return { pulling: next }
        })
      }
    } catch {
      // The server may have finished/cleaned the pull already (or gone away).
      // Reset the flag so the row is not stuck in a disabled "Cancelling…"
      // state; the pull's own terminal SSE event (or an error) clears the row.
      set((state) => {
        const current = state.pulling[modelId]
        if (!current) return {}
        return {
          pulling: {
            ...state.pulling,
            [modelId]: { ...current, cancelling: false },
          },
        }
      })
    }
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
    const task = p.task ?? get().pulling[p.modelId]?.task ?? "image-to-image"
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
