import { Check, ChevronDown, Settings2 } from "lucide-react"
import { useNavigate } from "react-router-dom"
import { useModelsStore } from "../store/models"
import type { LLMTask } from "../types"
import { Button } from "./ui/button"
import { Separator } from "./ui/separator"
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover"
import { cn } from "../lib/utils"

export function ModelPicker({ task, className }: { task: LLMTask; className?: string }) {
  const models = useModelsStore((s) => s.models)
  const selected = useModelsStore((s) => s.selected[task])
  const { select } = useModelsStore()
  const navigate = useNavigate()

  const taskModels = models.filter((m) => m.task === task)
  const active = taskModels.find((m) => m.id === selected)

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
          <p className="px-2 py-3 text-center text-xs text-muted-foreground">
            No {task} models pulled yet — add one in Manage models.
          </p>
        ) : (
          <div className="flex max-h-64 flex-col overflow-y-auto">
            {taskModels.map((model) => (
              <button
                key={model.id}
                onClick={() => void select(task, model.id)}
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-muted",
                  selected === model.id && "bg-muted text-foreground"
                )}
              >
                <span className="min-w-0 flex-1 truncate">{model.name ?? model.id}</span>
                {selected === model.id && <Check className="size-4 shrink-0" />}
              </button>
            ))}
          </div>
        )}

        <Separator className="my-2" />

        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start text-xs text-muted-foreground"
          onClick={() => navigate("/models")}
        >
          <Settings2 data-icon="inline-start" />
          Manage models…
        </Button>
      </PopoverContent>
    </Popover>
  )
}
