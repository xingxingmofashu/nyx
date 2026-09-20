import { create } from "zustand"
import type { ModelInfo, ModelPullProgress, LLMTask } from "../types"

export interface PullState {
  task: LLMTask
  file?: string
  loaded?: number
  total?: number
  percent?: number
  
  cancelling?: boolean
}

interface ModelsState {
  models: ModelInfo[]
  
  selected: Partial<Record<LLMTask, string>>
  
  pulling: Record<string, PullState>
  load: () => Promise<void>
  select: (task: LLMTask, modelId: string) => Promise<void>
  startPull: (modelId: string, task: LLMTask) => Promise<void>
  
  cancelPull: (modelId: string) => Promise<void>
  
  updatePullProgress: (p: ModelPullProgress) => void
  
  remove: (modelId: string) => Promise<void>
}

export const useModelsStore = create<ModelsState>((set, get) => ({
  models: [],
  selected: {},
  pulling: {},

  load: async () => {
    const models = await window.nyx.models.list()
    set((state) => {
      
      
      const selected = { ...state.selected }
      for (const model of models) {
        
        
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
        
        
        
        
        set((state) => {
          const next = { ...state.pulling }
          delete next[modelId]
          return { pulling: next }
        })
      }
    } catch {
      
      
      
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
