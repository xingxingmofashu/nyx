import { useState } from "react"
import { RotateCw } from "lucide-react"
import { Button } from "../ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card"
import { Field, FieldDescription, FieldLabel } from "../ui/field"
import { Input } from "../ui/input"
import { Label } from "../ui/label"
import { Separator } from "../ui/separator"
import { Switch } from "../ui/switch"

const HF_EXAMPLES = ["https://huggingface.co", "https://hf-mirror.com"]

export interface HuggingFaceSettingsCardProps {
  remoteHost: string | undefined
  cacheDir: string | undefined
  allowRemoteModels: boolean
  onRemoteHostChange: (value: string | undefined) => void
  onCacheDirChange: (value: string | undefined) => void
  onAllowRemoteModelsChange: (value: boolean) => void
  onRestartServer: () => Promise<void>
}

export function HuggingFaceSettingsCard({
  remoteHost,
  cacheDir,
  allowRemoteModels,
  onRemoteHostChange,
  onCacheDirChange,
  onAllowRemoteModelsChange,
  onRestartServer,
}: HuggingFaceSettingsCardProps) {
  const [restarting, setRestarting] = useState(false)
  const [restartError, setRestartError] = useState<string | null>(null)

  const restart = async () => {
    setRestarting(true)
    setRestartError(null)
    try {
      await onRestartServer()
    } catch (e) {
      setRestartError(e instanceof Error ? e.message : String(e))
    } finally {
      setRestarting(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Hugging Face</CardTitle>
        <CardDescription>Where model downloads come from, and where they are cached.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <Field>
          <FieldLabel htmlFor="hub-url">Base URL / mirror</FieldLabel>
          <Input
            id="hub-url"
            value={remoteHost ?? ""}
            onChange={(e) => onRemoteHostChange(e.target.value || undefined)}
            placeholder="https://huggingface.co"
            className="max-w-105"
          />
          <FieldDescription>
            Models download from this endpoint. In mainland China use a mirror such as{" "}
            <code className="rounded bg-muted px-1">https://hf-mirror.com</code>.
          </FieldDescription>
          <div className="flex flex-wrap items-center gap-1.5 pt-1">
            {HF_EXAMPLES.map((ex) => (
              <Button
                key={ex}
                variant="outline"
                size="sm"
                className="text-xs"
                onClick={() => onRemoteHostChange(ex)}
              >
                {ex}
              </Button>
            ))}
          </div>
        </Field>

        <Separator />

        <Field>
          <FieldLabel htmlFor="cache-dir">Cache directory</FieldLabel>
          <Input
            id="cache-dir"
            value={cacheDir ?? ""}
            onChange={(e) => onCacheDirChange(e.target.value || undefined)}
            placeholder="~/.nyx/models"
            className="max-w-105"
          />
          <FieldDescription>
            Where downloaded models are stored. Defaults to ~/.nyx/models; use an absolute path.
          </FieldDescription>
        </Field>

        <Separator />

        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <Label htmlFor="allow-remote-models">Allow remote downloads</Label>
            <p className="text-xs text-muted-foreground">
              Off = offline: only models already in the local cache are used.
            </p>
          </div>
          <Switch
            id="allow-remote-models"
            checked={allowRemoteModels}
            onCheckedChange={onAllowRemoteModelsChange}
          />
        </div>

        <Separator />

        <div className="flex items-center justify-between gap-4">
          <p className="text-xs text-muted-foreground">
            Endpoint, cache and offline changes apply to the inference server at startup —{" "}
            <strong>Restart server</strong> saves pending changes first, then restarts it.
          </p>
          <Button variant="outline" size="sm" onClick={() => void restart()} disabled={restarting}>
            <RotateCw data-icon="inline-start" className={restarting ? "animate-spin" : undefined} />
            {restarting ? "Restarting…" : "Restart server"}
          </Button>
        </div>
        {restartError && <p className="text-sm text-destructive">{restartError}</p>}
      </CardContent>
    </Card>
  )
}
