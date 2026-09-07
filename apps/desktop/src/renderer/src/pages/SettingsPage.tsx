import { useEffect, useState } from "react"
import { FolderOpen, Save } from "lucide-react"
import type { Settings } from "../../../shared/types"
import { Button } from "../components/ui/button"
import { Input } from "../components/ui/input"
import { Label } from "../components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select"
import { Separator } from "../components/ui/separator"
import { getTheme, setTheme, type Theme } from "../lib/theme"

const HF_EXAMPLES = ["https://huggingface.co", "https://hf-mirror.com"]

const THEME_OPTIONS: Array<{ id: Theme; label: string }> = [
  { id: "light", label: "Light" },
  { id: "dark", label: "Dark" },
  { id: "system", label: "System" },
]

/** App settings: theme, download endpoint, and cache location. */
export function SettingsPage() {
  const [theme, setThemeState] = useState<Theme>(getTheme)
  const [hubBaseUrl, setHubBaseUrl] = useState("")
  const [modelsDir, setModelsDir] = useState("")
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void (async () => {
      const [s, dir] = await Promise.all([window.nyx.config.getSettings(), window.nyx.config.getModelsDir()])
      setHubBaseUrl(s.hubBaseUrl ?? "https://huggingface.co")
      setModelsDir(dir)
    })()
  }, [])

  const changeTheme = (t: Theme) => {
    setTheme(t)
    setThemeState(t)
  }

  const save = async () => {
    setSaved(false)
    setError(null)
    const value = hubBaseUrl.trim()
    const patch: Settings = { hubBaseUrl: value && value !== "https://huggingface.co" ? value : undefined }
    try {
      await window.nyx.config.setSettings(patch)
      setSaved(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
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

      {/* Downloads */}
      <Card>
        <CardHeader>
          <CardTitle>Downloads</CardTitle>
          <CardDescription>Where model downloads come from and where models live.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="hub-url">Hugging Face base URL</Label>
            <div className="flex gap-2">
              <Input
                id="hub-url"
                value={hubBaseUrl}
                onChange={(e) => setHubBaseUrl(e.target.value)}
                placeholder="https://huggingface.co"
                className="max-w-105"
              />
              <Button onClick={() => void save()} className="shrink-0">
                <Save data-icon="inline-start" />
                Save
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Models download from this endpoint. In mainland China use a mirror such as{" "}
              <code className="rounded bg-muted px-1">https://hf-mirror.com</code>. Changes apply after restarting Nyx.
            </p>
            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              {HF_EXAMPLES.map((ex) => (
                <Button key={ex} variant="outline" size="sm" className="text-xs" onClick={() => setHubBaseUrl(ex)}>
                  {ex}
                </Button>
              ))}
            </div>
          </div>

          <Separator />

          <div className="flex items-center gap-2">
            <FolderOpen className="size-4 text-muted-foreground" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">Local model cache</p>
              <p className="truncate text-xs text-muted-foreground">{modelsDir}</p>
            </div>
          </div>

          {saved && <p className="text-sm text-emerald-600 dark:text-emerald-400">Settings saved. Restart Nyx to apply.</p>}
          {error && <p className="text-sm text-destructive">{error}</p>}
        </CardContent>
      </Card>
    </div>
  )
}
