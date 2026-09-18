import { create } from "zustand"
import { parseContextLimit } from "../lib/model"

interface AgentSettingsState {
  /** Current agent model, e.g. "OpenCode Go · opencode/mimo-v2.5". */
  modelLabel: string
  /** True when agent.model is configured in settings.json. */
  configured: boolean
  /** Workspace the agent's coding tools are confined to. */
  workspaceDir: string
  /** Context window from the provider config, when set. */
  contextLimit?: number
  initialized: boolean
  init: () => Promise<void>
  /** Re-read settings (after the Settings page saves); no one-shot guard. */
  refresh: () => Promise<void>
  setWorkspace: (dir: string) => Promise<void>
}

/** Agent settings shown read-only in the UI; the transcript lives in `agentChat`. */
export const useAgentStore = create<AgentSettingsState>((set, get) => ({
  modelLabel: "",
  configured: false,
  workspaceDir: "",
  contextLimit: undefined,
  initialized: false,

  init: async () => {
    if (get().initialized) return
    set({ initialized: true })
    set(await readAgentState())
  },

  refresh: async () => {
    set(await readAgentState())
  },

  setWorkspace: async (dir) => {
    set({ workspaceDir: dir })
    await window.nyx.config.setSettings({ agent: { workspaceDir: dir } })
  },
}))

/** Derive the display state from the persisted settings. */
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
