import { create } from "zustand"

interface AgentSettingsState {
  /** Current master brain, e.g. "OpenCode Go · opencode/mimo-v2.5". */
  brainLabel: string
  /** True when agent.model is configured in settings.json. */
  configured: boolean
  /** Workspace the agent's coding tools are confined to. */
  workspaceDir: string
  initialized: boolean
  init: () => Promise<void>
  setWorkspace: (dir: string) => Promise<void>
}

/** Agent settings shown read-only in the UI; the transcript lives in `agentChat`. */
export const useAgentStore = create<AgentSettingsState>((set, get) => ({
  brainLabel: "",
  configured: false,
  workspaceDir: "",
  initialized: false,

  init: async () => {
    if (get().initialized) return
    set({ initialized: true })

    const settings = await window.nyx.config.getSettings()
    const agent = settings.agent
    const ref = agent?.model
    let brainLabel = ""
    if (ref) {
      const slash = ref.indexOf("/")
      const providerId = slash > 0 ? ref.slice(0, slash) : ""
      const name = providerId ? agent?.provider?.[providerId]?.name : undefined
      brainLabel = name ? `${name} · ${ref}` : ref
    }
    set({ brainLabel, configured: Boolean(ref), workspaceDir: agent?.workspaceDir ?? "" })
  },

  setWorkspace: async (dir) => {
    set({ workspaceDir: dir })
    await window.nyx.config.setSettings({ agent: { workspaceDir: dir } })
  },
}))
