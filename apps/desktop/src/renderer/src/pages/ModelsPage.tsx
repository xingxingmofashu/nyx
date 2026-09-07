import { useState } from "react"
import { Boxes, Download, HardDrive, Trash2 } from "lucide-react"
import { useModelsStore, type PullState } from "../store/models"
import type { LLMTask } from "../../../shared/types"
import { Badge } from "../components/ui/badge"
import { Button } from "../components/ui/button"
import { Input } from "../components/ui/input"
import { Label } from "../components/ui/label"
import { Progress } from "../components/ui/progress"
import { Separator } from "../components/ui/separator"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "../components/ui/empty"
import { Spinner } from "../components/ui/spinner"
import { toast } from "../components/ui/toast"
import { cn } from "../lib/utils"

const TASK_OPTIONS: Array<{ id: LLMTask; label: string }> = [
  { id: "text-generation", label: "Text generation" },
  { id: "image-to-image", label: "Image to image" },
]

const TASK_LABEL: Record<string, string> = {
  "text-generation": "Text generation",
  "image-to-image": "Image to image",
}

/** Bytes → human readable ("4.2 GB"). */
function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "—"
  const units = ["B", "KB", "MB", "GB", "TB"]
  const i = Math.min(units.length - 1, Math.floor(Math.log(n) / Math.log(1024)))
  return `${(n / 1024 ** i).toFixed(i === 0 ? 0 : 1)} ${units[i]}`
}

/** Manage installed models: pull new ones with live progress, or remove cached ones. */
export function ModelsPage() {
  const models = useModelsStore((s) => s.models)
  const pulling = useModelsStore((s) => s.pulling)
  const { startPull, remove } = useModelsStore()

  const [modelId, setModelId] = useState("")
  const [task, setTask] = useState<LLMTask>("text-generation")
  const [busy, setBusy] = useState(false)

  const downloads = Object.entries(pulling)

  const doPull = async () => {
    const id = modelId.trim()
    if (!id || busy) return
    setBusy(true)
    try {
      await startPull(id, task)
      setModelId("")
    } catch {
      // Errors are toasted from the IPC progress broadcast; nothing more to do.
    } finally {
      setBusy(false)
    }
  }

  const removeModel = async (id: string) => {
    try {
      await remove(id)
    } catch (e) {
      toast.add({
        title: `Remove failed: ${id}`,
        description: e instanceof Error ? e.message : String(e),
        type: "error",
      })
    }
  }

  const installed = [...models].sort((a, b) => a.id.localeCompare(b.id))

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
      {/* Pull form */}
      <Card>
        <CardHeader>
          <CardTitle>Pull model</CardTitle>
          <CardDescription>Download an ONNX model from Hugging Face into the local cache.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <Label htmlFor="model-id">Model id</Label>
              <Input
                id="model-id"
                value={modelId}
                onChange={(e) => setModelId(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && void doPull()}
                placeholder="onnx-community/Qwen2.5-0.5B-Instruct"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="task">Task</Label>
              <Select
                value={task}
                onValueChange={(v) => {
                  if (v === "text-generation" || v === "image-to-image") setTask(v)
                }}
              >
                <SelectTrigger id="task" size="sm" className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TASK_OPTIONS.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={() => void doPull()} disabled={busy || !modelId.trim()} className="shrink-0">
              {busy ? <Spinner data-icon="inline-start" /> : <Download data-icon="inline-start" />}
              Pull
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Active downloads */}
      {downloads.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Downloading</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {downloads.map(([id, state]) => (
              <DownloadRow key={id} modelId={id} state={state} />
            ))}
          </CardContent>
        </Card>
      )}

      {/* Installed models */}
      <Card>
        <CardHeader>
          <CardTitle>Installed models</CardTitle>
          <CardDescription>
            {installed.length > 0
              ? `${installed.length} model${installed.length === 1 ? "" : "s"} cached locally.`
              : "Nothing cached yet — pull a model above."}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {installed.length === 0 ? (
            <Empty className="border-0 p-6">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <Boxes />
                </EmptyMedia>
                <EmptyTitle>No models installed</EmptyTitle>
                <EmptyDescription>Enter a Hugging Face model id above to download your first one.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            installed.map((model, i) => (
              <div key={model.id}>
                {i > 0 && <Separator className="my-2" />}
                <div className="flex items-center gap-3 px-1 py-0.5">
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="truncate text-sm font-medium">{model.name}</span>
                    <span className="truncate text-xs text-muted-foreground">{model.id}</span>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <Badge variant="secondary">{TASK_LABEL[model.task] ?? model.task}</Badge>
                    {model.dtype && <Badge variant="outline">{model.dtype}</Badge>}
                  </div>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Remove ${model.id}`}
                    title="Remove model"
                    onClick={() => void removeModel(model.id)}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 />
                  </Button>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function DownloadRow({ modelId, state }: { modelId: string; state: PullState }) {
  const percent = state.percent ?? (state.loaded && state.total ? Math.round((state.loaded / state.total) * 100) : 0)
  const hasTotal = typeof state.total === "number" && state.total > 0
  const value = hasTotal ? percent : null

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex min-w-0 items-baseline gap-2">
        <HardDrive className="size-3.5 shrink-0 self-center text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{modelId}</span>
        <span className="text-xs text-muted-foreground tabular-nums">
          {hasTotal ? `${formatBytes(state.loaded ?? 0)} / ${formatBytes(state.total!)} (${percent}%)` : "Downloading…"}
        </span>
      </div>
      <div className="flex items-center gap-2 pl-5">
        <Progress value={value} className={cn("flex-1", !hasTotal && "opacity-60")} aria-label={`Downloading ${modelId}`} />
        <span className="min-w-0 flex-1 truncate pl-1 text-xs text-muted-foreground">{state.file ?? modelId}</span>
      </div>
    </div>
  )
}
