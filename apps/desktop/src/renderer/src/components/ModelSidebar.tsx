import { useEffect, useState } from "react"
import { Download, RefreshCw } from "lucide-react"
import { useModelsStore } from "../store/models"
import type { ModelTask } from "../../../shared/types"

const TASK_LABELS: Record<ModelTask, string> = {
  "text-generation": "Text generation",
  "image-to-image": "Image-to-image",
}

const TASK_GROUPS: ModelTask[] = ["text-generation", "image-to-image"]

/** Sidebar listing cached models grouped by task with pull controls. */
export function ModelSidebar() {
  const { models, selected, pulling, load, select, startPull } = useModelsStore()
  const [modelsDir, setModelsDir] = useState("")

  useEffect(() => {
    void load()
    void window.nyx.config.getModelsDir().then(setModelsDir)
  }, [load])

  const refresh = () => void load()

  return (
    <aside className="flex w-64 shrink-0 flex-col border-r border-zinc-800 bg-zinc-900/60">
      <div className="flex items-center justify-between px-3 py-2">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Models</h2>
        <button
          onClick={refresh}
          className="text-zinc-500 hover:text-zinc-300"
          aria-label="Refresh model list"
        >
          <RefreshCw size={14} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-2 pb-2">
        {TASK_GROUPS.map((task) => {
          const taskModels = models.filter((m) => m.task === task || m.task === "unknown")
          return (
            <div key={task} className="mb-3">
              <h3 className="mb-1 px-1 text-[11px] font-medium text-zinc-500">{TASK_LABELS[task]}</h3>
              {taskModels.length === 0 ? (
                <p className="px-1 text-[11px] text-zinc-600">No models pulled yet.</p>
              ) : (
                <ul className="space-y-0.5">
                  {taskModels.map((model) => {
                    const isSelected = selected[task] === model.id
                    const progress = pulling[model.id]
                    return (
                      <li key={model.id}>
                        <button
                          onClick={() => void select(task, model.id)}
                          className={`w-full rounded-md px-2 py-1.5 text-left text-xs transition-colors ${
                            isSelected ? "bg-zinc-700 text-white" : "text-zinc-300 hover:bg-zinc-800"
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="truncate">{model.id}</span>
                            {model.dtype && (
                              <span className="shrink-0 text-[10px] text-zinc-500">{model.dtype}</span>
                            )}
                          </div>
                          {progress !== undefined && (
                            <div className="mt-1 h-1 w-full overflow-hidden rounded bg-zinc-700">
                              <div
                                className="h-full bg-emerald-500 transition-all"
                                style={{ width: `${progress}%` }}
                              />
                            </div>
                          )}
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          )
        })}

        <PullForm onPulled={refresh} />
      </div>

      {modelsDir && (
        <p className="border-t border-zinc-800 px-3 py-2 text-[10px] text-zinc-600" title={modelsDir}>
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
    <div className="mt-2 border-t border-zinc-800 px-2 pt-3">
      <p className="mb-1 text-[11px] font-medium text-zinc-500">Pull model</p>
      <select
        value={task}
        onChange={(e) => setTask(e.target.value as ModelTask)}
        className="no-drag w-full rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1 text-xs text-zinc-200 outline-none focus:border-zinc-500"
      >
        {TASK_GROUPS.map((t) => (
          <option key={t} value={t}>
            {TASK_LABELS[t]}
          </option>
        ))}
      </select>
      <div className="mt-1 flex gap-1">
        <input
          value={modelId}
          onChange={(e) => setModelId(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && void submit()}
          placeholder="org/model-id"
          className="min-w-0 flex-1 rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1 text-xs text-zinc-200 outline-none placeholder:text-zinc-600 focus:border-zinc-500"
        />
        <button
          onClick={() => void submit()}
          disabled={busy || !modelId.trim()}
          className="flex items-center gap-1 rounded-md bg-emerald-600 px-2 py-1 text-xs font-medium text-white hover:bg-emerald-500 disabled:opacity-40"
        >
          <Download size={12} />
          {busy ? "…" : "Pull"}
        </button>
      </div>
      {error && <p className="mt-1 text-[11px] text-red-400">{error}</p>}
    </div>
  )
}
