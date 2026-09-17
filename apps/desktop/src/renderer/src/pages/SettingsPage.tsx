import { useEffect, useState } from "react"
import { Save } from "lucide-react"
import type { AppEnvironment, Settings } from "../../../shared/types"
import { Button } from "../components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card"
import { Label } from "../components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select"
import { toast } from "../components/ui/toast"
import { AgentSettingsCard } from "../components/settings/AgentSettingsCard"
import { HuggingFaceSettingsCard } from "../components/settings/HuggingFaceSettingsCard"
import { getTheme, setTheme, type Theme } from "../lib/theme"
import { useAgentStore } from "../store/agent"

const THEME_OPTIONS: Array<{ id: Theme; label: string }> = [
  { id: "light", label: "Light" },
  { id: "dark", label: "Dark" },
  { id: "system", label: "System" },
]

/**
 * Canonical JSON for change detection. Tool toggles default to on whether the
 * key is absent or explicitly `true`, so collapse the two to compare equal —
 * otherwise flipping a switch off and back on leaves "Save changes" enabled.
 */
function normalizeSettings(settings: Settings): string {
  const tools = settings.agent?.tools
  if (!tools) return JSON.stringify(settings)
  const clean = { ...tools }
  for (const key of ["localModels", "knowledge", "webSearch"] as const) {
    if (clean[key] === true) delete clean[key]
  }
  const agent = { ...settings.agent, tools: clean }
  const normalized: Settings = { ...settings, agent }
  if (Object.keys(clean).length === 0) {
    const { tools: _omitted, ...rest } = agent
    normalized.agent = rest
  }
  return JSON.stringify(normalized)
}

/** App settings: theme, the agent model, and Hugging Face downloads. */
export function SettingsPage() {
  const [theme, setThemeState] = useState<Theme>(getTheme)
  const [settings, setSettings] = useState<Settings | null>(null)
  const [snapshot, setSnapshot] = useState("")
  const [env, setEnv] = useState<AppEnvironment | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void (async () => {
      const [loaded, environment] = await Promise.all([
        window.nyx.config.getSettings(),
        window.nyx.config.getEnvironment(),
      ])
      setSettings(loaded)
      setSnapshot(normalizeSettings(loaded))
      setEnv(environment)
    })()
  }, [])

  const changeTheme = (t: Theme) => {
    setTheme(t)
    setThemeState(t)
  }

  // Mutate a clone so React sees a new object; `writeSettings` replaces the file
  // wholesale, so deletions (providers, keys) work.
  const update = (mutate: (draft: Settings) => void) =>
    setSettings((prev) => {
      if (!prev) return prev
      const next = structuredClone(prev)
      mutate(next)
      return next
    })

  const dirty = settings !== null && normalizeSettings(settings) !== snapshot

  const save = async (): Promise<boolean> => {
    if (!settings) return false
    setSaving(true)
    setError(null)
    try {
      const saved = await window.nyx.config.writeSettings(settings)
      setSettings(saved)
      setSnapshot(normalizeSettings(saved))
      await useAgentStore.getState().refresh()
      toast.add({ title: "Settings saved" })
      return true
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      return false
    } finally {
      setSaving(false)
    }
  }

  // Restarting re-reads settings.json, so flush pending edits first.
  const restartServer = async () => {
    if (!(await save())) throw new Error("Fix the settings error above, then restart.")
    await window.nyx.config.restartServer()
  }

  return (
    <div className="min-h-0 min-w-0 flex-1 space-y-4 overflow-y-auto p-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-lg font-semibold">Settings</h1>
        <Button onClick={() => void save()} disabled={!dirty || saving}>
          <Save data-icon="inline-start" />
          {saving ? "Saving…" : "Save changes"}
        </Button>
      </div>

      {!settings ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <>
          {/* Appearance */}
          <Card>
            <CardHeader>
              <CardTitle>Appearance</CardTitle>
              <CardDescription>Choose how Nyx looks.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="theme">Theme</Label>
                <Select value={theme} onValueChange={(v) => changeTheme(v as Theme)}>
                  <SelectTrigger id="theme" size="sm" className="w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {THEME_OPTIONS.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          <AgentSettingsCard
            agent={settings.agent ?? {}}
            onChange={(agent) =>
              update((draft) => {
                draft.agent = agent
              })
            }
          />

          <HuggingFaceSettingsCard
            hubBaseUrl={settings.hubBaseUrl}
            allowRemoteModels={settings.allowRemoteModels !== false}
            modelsDir={env?.modelsDir ?? ""}
            onHubBaseUrlChange={(value) =>
              update((draft) => {
                draft.hubBaseUrl = value
              })
            }
            onAllowRemoteModelsChange={(value) =>
              update((draft) => {
                draft.allowRemoteModels = value
              })
            }
            onRestartServer={() => restartServer()}
          />

          {error && <p className="text-sm text-destructive">{error}</p>}
        </>
      )}
    </div>
  )
}
