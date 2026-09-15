import { useState } from "react"
import { FolderOpen, RotateCw } from "lucide-react"
import { Button } from "../ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card"
import { Field, FieldDescription, FieldLabel } from "../ui/field"
import { Input } from "../ui/input"
import { Label } from "../ui/label"
import { Separator } from "../ui/separator"
import { Switch } from "../ui/switch"

const HF_EXAMPLES = ["https://huggingface.co", "https://hf-mirror.com"]

export interface HuggingFaceSettingsCardProps {
  hubBaseUrl: string | undefined
  allowRemoteModels: boolean
  modelsDir: string
  onHubBaseUrlChange: (value: string | undefined) => void
  onAllowRemoteModelsChange: (value: boolean) => void
  onRestartServer: () => Promise<void>
}

/** Hugging Face download settings: endpoint/mirror, offline mode, cache path. */
export function HuggingFaceSettingsCard({
  hubBaseUrl,
  allowRemoteModels,
  modelsDir,
  onHubBaseUrlChange,
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
        <CardDescription>Where model downloads come from, and whether they are allowed at all.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <Field>
          <FieldLabel htmlFor="hub-url">Base URL / mirror</FieldLabel>
          <Input
            id="hub-url"
            value={hubBaseUrl ?? ""}
            onChange={(e) => onHubBaseUrlChange(e.target.value || undefined)}
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
                onClick={() => onHubBaseUrlChange(ex)}
              >
                {ex}
              </Button>
            ))}
          </div>
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

        <div className="flex items-center gap-2">
          <FolderOpen className="size-4 text-muted-foreground" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">Local model cache</p>
            <p className="truncate text-xs text-muted-foreground">{modelsDir}</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => void restart()} disabled={restarting}>
            <RotateCw data-icon="inline-start" className={restarting ? "animate-spin" : undefined} />
            {restarting ? "Restarting…" : "Restart server"}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Endpoint and offline changes apply to the inference server at startup — <strong>Restart server</strong>
          {" "}saves pending changes first, then restarts it. The cache path is set with{" "}
          <code className="rounded bg-muted px-1">NYX_MODELS_DIR</code> before launch.
        </p>
        {restartError && <p className="text-sm text-destructive">{restartError}</p>}
      </CardContent>
    </Card>
  )
}
