import { useState } from "react"
import { Boxes, Download, HardDrive, Trash2, X } from "lucide-react"
import { useModelsStore, type PullState } from "../store/models"
import type { LLMTask } from "../types"
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
import { formatBytes } from "../lib/format"

const TASK_OPTIONS: Array<{ id: LLMTask; label: string }> = [
  { id: "image-to-image", label: "Image to image" },
  { id: "text-to-speech", label: "Text to speech" },
  { id: "automatic-speech-recognition", label: "Automatic speech recognition" },
  { id: "feature-extraction", label: "Feature extraction (embeddings)" },
]

const TASK_LABEL: Record<string, string> = Object.fromEntries(TASK_OPTIONS.map((t) => [t.id, t.label]))

export function ModelsPage() {
  const models = useModelsStore((s) => s.models)
  const pulling = useModelsStore((s) => s.pulling)
  const startPull = useModelsStore((s) => s.startPull)
  const cancelPull = useModelsStore((s) => s.cancelPull)
  const remove = useModelsStore((s) => s.remove)

  const [modelId, setModelId] = useState("")
  const [task, setTask] = useState<LLMTask>("image-to-image")

  const downloads = Object.entries(pulling)

  const doPull = async () => {
    const id = modelId.trim()
    if (!id) return
    try {
      await startPull(id, task)
      setModelId("")
    } catch {
      
    }
  }

  const cancelDownload = (id: string) => {
    void cancelPull(id).catch(() => {
      
    })
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
    <div className="min-h-0 min-w-0 flex-1 space-y-4 overflow-y-auto p-4">
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
                  const option = TASK_OPTIONS.find((t) => t.id === v)
                  if (option) setTask(option.id)
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
            <Button onClick={() => void doPull()} disabled={!modelId.trim()} className="shrink-0">
              <Download data-icon="inline-start" />
              Pull
            </Button>
          </div>
        </CardContent>
      </Card>

      {downloads.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Downloading</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {downloads.map(([id, state]) => (
              <DownloadRow key={id} modelId={id} state={state} onCancel={() => cancelDownload(id)} />
            ))}
          </CardContent>
        </Card>
      )}

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

function DownloadRow({ modelId, state, onCancel }: { modelId: string; state: PullState; onCancel: () => void }) {
  const percent = state.percent ?? (state.loaded && state.total ? Math.round((state.loaded / state.total) * 100) : 0)
  const hasTotal = typeof state.total === "number" && state.total > 0
  const value = hasTotal ? percent : null

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex min-w-0 items-center gap-2">
        <HardDrive className="size-3.5 shrink-0 self-center text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{modelId}</span>
        <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
          {hasTotal ? `${formatBytes(state.loaded ?? 0)} / ${formatBytes(state.total!)} (${percent}%)` : "Downloading…"}
        </span>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`Cancel download ${modelId}`}
          title={state.cancelling ? "Cancelling…" : "Cancel download"}
          disabled={state.cancelling}
          onClick={onCancel}
          className="text-muted-foreground hover:text-destructive"
        >
          {state.cancelling ? <Spinner className="size-4" /> : <X />}
        </Button>
      </div>
      <div className="flex items-center gap-2 pl-5">
        <Progress value={value} className={cn("flex-1", !hasTotal && "opacity-60")} aria-label={`Downloading ${modelId}`} />
        <span className="min-w-0 flex-1 truncate pl-1 text-xs text-muted-foreground">
          {state.cancelling ? "Cancelling…" : (state.file ?? modelId)}
        </span>
      </div>
    </div>
  )
}
