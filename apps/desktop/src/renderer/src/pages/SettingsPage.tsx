import { useCallback, useEffect, useState } from "react"
import { Save } from "lucide-react"
import type { Settings } from "../types"
import { Button } from "../components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card"
import { Label } from "../components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select"
import { toast } from "../components/ui/toast"
import { AgentSettingsCard } from "../components/settings/AgentSettingsCard"
import { HuggingFaceSettingsCard } from "../components/settings/HuggingFaceSettingsCard"
import { KnowledgeSettingsCard } from "../components/settings/KnowledgeSettingsCard"
import { getTheme, setTheme, type Theme } from "../lib/theme"
import { useAgentStore } from "../store/agent"

const THEME_OPTIONS: Array<{ id: Theme; label: string }> = [
  { id: "light", label: "Light" },
  { id: "dark", label: "Dark" },
  { id: "system", label: "System" },
]

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function settingsEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

function mergeSettings(base: Settings, page: Settings, latest: Settings): Settings {
  const merged: Settings = { ...latest }
  const baseRecord = base as Record<string, unknown>
  const pageRecord = page as Record<string, unknown>
  const mergedRecord = merged as Record<string, unknown>
  for (const key of new Set([...Object.keys(baseRecord), ...Object.keys(pageRecord)])) {
    const baseValue = baseRecord[key]
    const pageValue = pageRecord[key]
    if (isRecord(baseValue) && isRecord(pageValue)) {
      const latestValue = mergedRecord[key]
      const section: Record<string, unknown> = isRecord(latestValue) ? { ...latestValue } : {}
      for (const field of new Set([...Object.keys(baseValue), ...Object.keys(pageValue)])) {
        if (!settingsEqual(pageValue[field], baseValue[field])) section[field] = pageValue[field]
      }
      mergedRecord[key] = section
    } else if (!settingsEqual(pageValue, baseValue)) {
      mergedRecord[key] = pageValue
    }
  }
  return merged
}

export function SettingsPage() {
  const [theme, setThemeState] = useState<Theme>(getTheme)
  const [settings, setSettings] = useState<Settings | null>(null)
  const [base, setBase] = useState<Settings | null>(null)
  const [saving, setSaving] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoadError(null)
    try {
      const loaded = await window.nyx.config.getSettings()
      setSettings(loaded)
      setBase(loaded)
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : String(e))
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const changeTheme = (t: Theme) => {
    setTheme(t)
    setThemeState(t)
  }

  
  
  const update = (mutate: (draft: Settings) => void) =>
    setSettings((prev) => {
      if (!prev) return prev
      const next = structuredClone(prev)
      mutate(next)
      return next
    })

  const snapshot = base ? normalizeSettings(base) : ""
  const dirty = settings !== null && normalizeSettings(settings) !== snapshot

  const save = async (): Promise<boolean> => {
    if (!settings || !base) return false
    setSaving(true)
    setError(null)
    try {
      const latest = await window.nyx.config.getSettings()
      const merged = mergeSettings(base, settings, latest)
      const saved = await window.nyx.config.writeSettings(merged)
      setSettings(saved)
      setBase(saved)
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

      {loadError !== null ? (
        <div className="flex flex-col items-start gap-2">
          <p className="text-sm text-destructive">{loadError}</p>
          <Button variant="outline" size="sm" onClick={() => void load()}>
            Retry
          </Button>
        </div>
      ) : !settings ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <>
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
            remoteHost={settings.huggingface?.remoteHost}
            cacheDir={settings.huggingface?.cacheDir}
            allowRemoteModels={settings.huggingface?.allowRemoteModels !== false}
            onRemoteHostChange={(value) =>
              update((draft) => {
                draft.huggingface = { ...draft.huggingface, remoteHost: value }
              })
            }
            onCacheDirChange={(value) =>
              update((draft) => {
                draft.huggingface = { ...draft.huggingface, cacheDir: value }
              })
            }
            onAllowRemoteModelsChange={(value) =>
              update((draft) => {
                draft.huggingface = { ...draft.huggingface, allowRemoteModels: value }
              })
            }
            onRestartServer={() => restartServer()}
          />

          <KnowledgeSettingsCard
            knowledge={settings.knowledge ?? {}}
            onChange={(knowledge) =>
              update((draft) => {
                draft.knowledge = knowledge
              })
            }
          />

          {error && <p className="text-sm text-destructive">{error}</p>}
        </>
      )}
    </div>
  )
}
