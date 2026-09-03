import { useEffect, useState } from "react"
import { Download, RefreshCw } from "lucide-react"
import { useModelsStore } from "../store/models"
import type { ModelTask } from "../../../shared/types"
import { Button } from "./ui/button"
import { Input } from "./ui/input"
import { Separator } from "./ui/separator"
import { Badge } from "./ui/badge"
import { Progress } from "./ui/progress"
import { Field, FieldContent, FieldDescription, FieldGroup, FieldLabel } from "./ui/field"
import { cn } from "../lib/utils"

const TASK_LABELS: Record<ModelTask, string> = {
  "text-generation": "Text generation",
  "image-to-image": "Image-to-image",
}

const TASK_GROUPS: ModelTask[] = ["text-generation", "image-to-image"]

/** Sidebar listing installed models grouped by task with pull controls. */
export function ModelSidebar() {
  const { models, selected, pulling, load, select, startPull } = useModelsStore()
  const [modelsDir, setModelsDir] = useState("")

  useEffect(() => {
    void load()
    void window.nyx.config.getModelsDir().then(setModelsDir)
  }, [load])

  const refresh = () => void load()

  return (
    <aside className="flex w-64 shrink-0 flex-col border-r bg-card">
      <div className="flex items-center justify-between px-3 py-2.5">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Models</h2>
        <Button variant="ghost" size="icon-sm" className="text-muted-foreground" onClick={refresh} aria-label="Refresh model list">
          <RefreshCw />
        </Button>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto px-2 pb-3">
        {TASK_GROUPS.map((task) => {
          const taskModels = models.filter((m) => m.task === task || m.task === "unknown")
          return (
            <div key={task}>
              <h3 className="mb-1 px-1 text-xs font-medium text-muted-foreground">{TASK_LABELS[task]}</h3>
              {taskModels.length === 0 ? (
                <p className="px-1 text-xs text-muted-foreground/60">No models pulled yet.</p>
              ) : (
                <ul className="space-y-0.5">
                  {taskModels.map((model) => {
                    const isSelected = selected[task] === model.id
                    const progress = pulling[model.id]
                    return (
                      <li key={model.id}>
                        <button
                          onClick={() => void select(task, model.id)}
                          className={cn(
                            "w-full rounded-md px-2 py-1.5 text-left text-sm transition-colors",
                            isSelected ? "bg-primary text-primary-foreground" : "text-foreground/80 hover:bg-muted",
                          )}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="truncate">{model.name ?? model.id}</span>
                            {model.dtype && (
                              <Badge variant={isSelected ? "secondary" : "outline"} className="shrink-0 text-[10px]">
                                {model.dtype}
                              </Badge>
                            )}
                          </div>
                          {progress !== undefined && <Progress value={progress} className="mt-1 h-1" />}
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          )
        })}

        <Separator />
        <PullForm onPulled={refresh} />
      </div>

      {modelsDir && (
        <p className="border-t px-3 py-2 text-[10px] text-muted-foreground/60" title={modelsDir}>
          {modelsDir}
        </p>
      )}
    </aside>
  )
}

/** Pull a new model by id + task. */
function PullForm({ onPulled }: { onPulled: () => void }) {
  const { startPull } = useModelsStore()
  const [modelId, setModelId] = useState("")
  const [task, setTask] = useState<ModelTask>("text-generation")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    const id = modelId.trim()
    if (!id || busy) return
    setBusy(true)
    setError(null)
    try {
      await startPull(id, task)
      setModelId("")
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
      onPulled()
    }
  }

  return (
    <div className="space-y-2 px-1">
      <FieldGroup>
        <Field orientation="horizontal" className="items-center gap-2">
          <FieldLabel className="shrink-0 text-xs text-muted-foreground">Task</FieldLabel>
          <FieldContent>
            <select
              value={task}
              onChange={(e) => setTask(e.target.value as ModelTask)}
              className="no-drag w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm outline-none focus-visible:border-ring"
            >
              {TASK_GROUPS.map((t) => (
                <option key={t} value={t}>
                  {TASK_LABELS[t]}
                </option>
              ))}
            </select>
          </FieldContent>
        </Field>

        <Field>
          <FieldLabel htmlFor="model-id" className="sr-only">
            Model id
          </FieldLabel>
          <FieldContent>
            <div className="flex gap-1.5">
              <Input
                id="model-id"
                value={modelId}
                onChange={(e) => setModelId(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && void submit()}
                placeholder="org/model-id"
                aria-invalid={error ? true : undefined}
                className="h-8 min-w-0 flex-1 text-xs"
              />
              <Button size="sm" className="h-8 gap-1" onClick={() => void submit()} disabled={busy || !modelId.trim()}>
                <Download data-icon="inline-start" />
                {busy ? "…" : "Pull"}
              </Button>
            </div>
            {error && <FieldDescription className="text-xs text-destructive">{error}</FieldDescription>}
          </FieldContent>
        </Field>
      </FieldGroup>
    </div>
  )
}
