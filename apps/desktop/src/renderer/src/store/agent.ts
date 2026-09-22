import { create } from "zustand"
import { parseContextLimit } from "../lib/model"

interface AgentSettingsState {
  
  modelLabel: string
  
  configured: boolean
  
  workspaceDir: string
  
  contextLimit?: number
  initialized: boolean
  initError?: string
  init: () => Promise<void>
  
  refresh: () => Promise<void>
  setWorkspace: (dir: string) => Promise<void>
}

export const useAgentStore = create<AgentSettingsState>((set, get) => ({
  modelLabel: "",
  configured: false,
  workspaceDir: "",
  contextLimit: undefined,
  initialized: false,
  initError: undefined,

  init: async () => {
    if (get().initialized) return
    try {
      const state = await readAgentState()
      set({ ...state, initialized: true, initError: undefined })
    } catch (error) {
      set({ initialized: false, initError: error instanceof Error ? error.message : String(error) })
    }
  },

  refresh: async () => {
    set(await readAgentState())
  },

  setWorkspace: async (dir) => {
    set({ workspaceDir: dir })
    await window.nyx.config.setSettings({ agent: { workspaceDir: dir } })
  },
}))

async function readAgentState(): Promise<
  Pick<AgentSettingsState, "modelLabel" | "configured" | "workspaceDir" | "contextLimit">
> {
  const settings = await window.nyx.config.getSettings()
  const agent = settings.agent
  const ref = agent?.model
  let modelLabel = ""
  let contextLimit: number | undefined
  if (ref) {
    const slash = ref.indexOf("/")
    const providerId = slash > 0 ? ref.slice(0, slash) : ""
    const provider = providerId ? agent?.provider?.[providerId] : undefined
    const name = provider?.name
    modelLabel = name ? `${name} · ${ref}` : ref
    contextLimit = parseContextLimit(provider?.limit?.context)
  }
  return { modelLabel, configured: Boolean(ref), workspaceDir: agent?.workspaceDir ?? "", contextLimit }
}
