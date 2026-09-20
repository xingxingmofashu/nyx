import { create } from "zustand"
import type {
  KnowledgeDocument,
  KnowledgeImportResult,
  KnowledgeIndexEvent,
  KnowledgeSearchHit,
  KnowledgeStatus,
} from "../types"

interface KnowledgeState {
  status: KnowledgeStatus | null
  documents: KnowledgeDocument[]
  
  selected: string | null
  content: string | null
  
  loading: boolean
  
  indexing: KnowledgeIndexEvent | null
  
  collapsed: Record<string, boolean>
  
  filter: string
  
  target: string
  results: KnowledgeSearchHit[] | null
  searchError: string | null
  searching: boolean

  load: () => Promise<void>
  select: (path: string | null) => Promise<void>
  toggleFolder: (path: string) => void
  setFilter: (filter: string) => void
  setTarget: (target: string) => void
  importFiles: () => Promise<KnowledgeImportResult | null>
  importFolder: () => Promise<KnowledgeImportResult | null>
  
  remove: (path: string) => Promise<boolean>
  
  setEmbeddingModel: (model: string) => Promise<void>
  
  updateIndex: (rebuild: boolean) => Promise<void>
  cancelIndex: () => Promise<void>
  updateProgress: (event: KnowledgeIndexEvent) => void
  dismissNotice: () => void
  search: (query: string) => Promise<void>
  clearResults: () => void
}

export const useKnowledgeStore = create<KnowledgeState>((set, get) => ({
  status: null,
  documents: [],
  selected: null,
  content: null,
  loading: false,
  indexing: null,
  collapsed: {},
  filter: "",
  target: "",
  results: null,
  searchError: null,
  searching: false,

  load: async () => {
    const [status, documents] = await Promise.all([
      window.nyx.knowledge.status(),
      window.nyx.knowledge.list(),
    ])
    const selected = get().selected
    const stillThere = selected !== null && documents.some((doc) => doc.file === selected)
    
    
    const target = get().target
    const targetExists = target === "" || documents.some((doc) => doc.file.startsWith(`${target}/`))
    set({
      status,
      documents,
      ...(targetExists ? {} : { target: "" }),
      ...(stillThere ? {} : { selected: null, content: null }),
    })
  },

  select: async (path) => {
    set({ selected: path, content: null })
    if (path === null) return
    set({ loading: true })
    try {
      const content = await window.nyx.knowledge.read(path)
      
      if (get().selected === path) set({ content })
    } finally {
      if (get().selected === path) set({ loading: false })
    }
  },

  toggleFolder: (path) => {
    set((state) => ({ collapsed: { ...state.collapsed, [path]: !state.collapsed[path] } }))
  },

  setFilter: (filter) => set({ filter }),

  setTarget: (target) => set({ target }),

  importFiles: async () => {
    const result = await window.nyx.knowledge.importFiles(get().target)
    if (result === null) return null
    await get().load()
    if (result.written.length + result.overwritten.length > 0) await get().updateIndex(false)
    return result
  },

  importFolder: async () => {
    const result = await window.nyx.knowledge.importFolder(get().target)
    if (result === null) return null
    await get().load()
    if (result.written.length + result.overwritten.length > 0) await get().updateIndex(false)
    return result
  },

  remove: async (path) => {
    const removed = await window.nyx.knowledge.remove(path)
    if (!removed) return false
    if (get().selected === path) set({ selected: null, content: null })
    await get().load()
    return true
  },

  setEmbeddingModel: async (model) => {
    if (get().status?.embeddingModel === model) return
    await window.nyx.config.setSettings({ knowledge: { embeddingModel: model } })
    
    set({ results: null, searchError: null })
    await get().load()
  },

  updateIndex: async (rebuild) => {
    const current = get().indexing
    if (current !== null && !current.done) return
    set({ indexing: { phase: "embed", filesDone: 0, filesTotal: 0, chunks: 0, done: false } })
    try {
      
      await window.nyx.knowledge.index(rebuild)
    } catch {
      
    }
  },

  cancelIndex: async () => {
    await window.nyx.knowledge.cancelIndex()
  },

  updateProgress: (event) => {
    
    
    set({ indexing: event })
    if (event.done) void get().load()
  },

  dismissNotice: () => set({ indexing: null }),

  search: async (query) => {
    set({ searching: true, searchError: null })
    try {
      set({ results: await window.nyx.knowledge.search(query) })
    } catch (error) {
      set({ results: null, searchError: error instanceof Error ? error.message : String(error) })
    } finally {
      set({ searching: false })
    }
  },

  clearResults: () => set({ results: null, searchError: null }),
}))
