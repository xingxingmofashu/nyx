import { useEffect, useState } from "react"
import { Check, ChevronDown, Download, Trash2 } from "lucide-react"
import { useModelsStore } from "../store/models"
import type { LlmTask } from "../../../shared/types"
import { Button } from "./ui/button"
import { Input } from "./ui/input"
import { Separator } from "./ui/separator"
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover"
import { cn } from "../lib/utils"

/** Inline model selector: shows the active model for a task, lets the user pick or pull one. */
export function ModelPicker({ task, className }: { task: LlmTask; className?: string }) {
  const models = useModelsStore((s) => s.models)
  const selected = useModelsStore((s) => s.selected[task])
  const pulling = useModelsStore((s) => s.pulling)
  const { load, select, startPull, remove } = useModelsStore()
  const [modelId, setModelId] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void load()
  }, [load])

  const taskModels = models.filter((m) => m.task === task)
  const active = taskModels.find((m) => m.id === selected)

  const pull = async () => {
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
    }
  }

  const removeModel = async (id: string) => {
    setError(null)
    try {
      await remove(id)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button variant="outline" size="sm" className={cn("max-w-56 justify-between gap-2", className)}>
            <span className="truncate">{active ? active.name : "Select model"}</span>
            <ChevronDown className="shrink-0 text-muted-foreground" data-icon="inline-end" />
          </Button>
        }
      />
      <PopoverContent align="start" side="top" className="w-72 p-2">
        {taskModels.length === 0 ? (
          <p className="px-2 py-3 text-center text-xs text-muted-foreground">No {task} models pulled yet.</p>
        ) : (
          <div className="flex max-h-64 flex-col overflow-y-auto">
            {taskModels.map((model) => {
              const progress = pulling[model.id]
              return (
                <button
                  key={model.id}
                  onClick={() => void select(task, model.id)}
                  className={cn(
                    "group flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-muted",
                    selected === model.id && "bg-muted text-foreground"
                  )}
                >
                  <span className="min-w-0 flex-1 truncate">{model.name ?? model.id}</span>
                  {selected === model.id && <Check className="size-4 shrink-0" />}
                  {progress !== undefined && <span className="text-xs text-muted-foreground">{progress}%</span>}
                  <span
                    role="button"
                    tabIndex={0}
                    aria-label={`Remove ${model.id}`}
                    title="Remove model"
                    className="shrink-0 rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive focus:opacity-100 group-hover:opacity-100"
                    onClick={(e) => {
                      e.stopPropagation()
                      void removeModel(model.id)
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault()
                        e.stopPropagation()
                        void removeModel(model.id)
                      }
                    }}
                  >
                    <Trash2 className="size-3.5" />
                  </span>
                </button>
              )
            })}
          </div>
        )}

        <Separator className="my-2" />

        <div className="flex gap-1.5">
          <Input
            value={modelId}
            onChange={(e) => setModelId(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void pull()}
            placeholder={`Pull ${task} model…`}
            aria-invalid={error ? true : undefined}
            className="h-8 min-w-0 flex-1 text-xs"
          />
          <Button size="icon-sm" onClick={() => void pull()} disabled={busy || !modelId.trim()} aria-label="Pull model">
            <Download />
          </Button>
        </div>
        {error && (
          <p className="mt-1 px-1 text-xs text-destructive" role="alert">
            {error}
          </p>
        )}
      </PopoverContent>
    </Popover>
  )
}
