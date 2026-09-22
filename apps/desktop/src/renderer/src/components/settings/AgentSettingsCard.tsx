import { useEffect, useRef, useState } from "react"
import { Loader2, Plus, RefreshCw } from "lucide-react"
import type { AgentProviderEntry, AgentSettings, ProviderModels } from "../../types"
import { Button } from "../ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card"
import { Field, FieldDescription, FieldError, FieldLabel } from "../ui/field"
import { Input } from "../ui/input"
import { Label } from "../ui/label"
import { Separator } from "../ui/separator"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select"
import { Switch } from "../ui/switch"
import { Textarea } from "../ui/textarea"
import { ProviderEditor } from "./ProviderEditor"

export interface AgentSettingsCardProps {
  agent: AgentSettings
  onChange: (next: AgentSettings) => void
}

const CUSTOM_MODEL = "__custom__"

export function AgentSettingsCard({ agent, onChange }: AgentSettingsCardProps) {
  const [models, setModels] = useState<Record<string, ProviderModels>>({})
  const [modelErrors, setModelErrors] = useState<Record<string, string>>({})
  const [loadingModels, setLoadingModels] = useState(false)
  const [customModel, setCustomModel] = useState(false)
  const [renameError, setRenameError] = useState<string | null>(null)
  const [editorReset, setEditorReset] = useState<Record<string, number>>({})
  const inFlight = useRef(new Set<string>())
  const providers = agent.provider ?? {}
  const ids = Object.keys(providers)
  const ref = agent.model ?? ""
  const slash = ref.indexOf("/")
  const modelProviderId = slash > 0 ? ref.slice(0, slash) : ""
  const modelId = slash > 0 ? ref.slice(slash + 1) : ref
  const providerOptions =
    modelProviderId && !ids.includes(modelProviderId) ? [modelProviderId, ...ids] : ids
  const refUnknown = Boolean(modelProviderId) && !ids.includes(modelProviderId)

  const tools = agent.tools ?? {}
  const activeEntry = modelProviderId ? providers[modelProviderId] : undefined
  const currentModels = modelProviderId ? models[modelProviderId] : undefined
  const modelList = currentModels?.ids ?? []
  const canPick = modelList.length > 0 && !customModel
  
  const modelOptions = modelId && !modelList.includes(modelId) ? [modelId, ...modelList] : modelList

  const loadModels = async (providerId: string, entry: AgentProviderEntry) => {
    
    if (inFlight.current.has(providerId)) return
    inFlight.current.add(providerId)
    setLoadingModels(true)
    setModelErrors((prev) => {
      if (!(providerId in prev)) return prev
      const { [providerId]: _cleared, ...rest } = prev
      return rest
    })
    try {
      const result = await window.nyx.config.listModels(entry)
      setModels((prev) => ({ ...prev, [providerId]: result }))
    } catch (error) {
      setModelErrors((prev) => ({
        ...prev,
        [providerId]: error instanceof Error ? error.message : String(error),
      }))
    } finally {
      inFlight.current.delete(providerId)
      setLoadingModels(false)
    }
  }

  
  useEffect(() => {
    if (!modelProviderId || !activeEntry || models[modelProviderId]) return
    if (!activeEntry.options?.apiKey) return
    void loadModels(modelProviderId, activeEntry)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modelProviderId, activeEntry?.options?.apiKey, activeEntry?.options?.baseURL, activeEntry?.modelsUrl])

  
  useEffect(() => {
    setCustomModel(false)
  }, [modelProviderId])

  const setModelRef = (providerId: string, nextModelId: string) => {
    const next = providerId ? `${providerId}/${nextModelId}` : nextModelId
    onChange({ ...agent, model: next.trim() ? next : undefined })
  }

  const setProvider = (id: string, entry: AgentProviderEntry) =>
    onChange({ ...agent, provider: { ...providers, [id]: entry } })

  const renameProvider = (oldId: string, nextId: string) => {
    const id = nextId.trim()
    
    
    if (!id || id === oldId) return
    if (providers[id]) {
      setRenameError(`A provider named “${id}” already exists.`)
      setEditorReset((prev) => ({ ...prev, [oldId]: (prev[oldId] ?? 0) + 1 }))
      return
    }
    setRenameError(null)
    const next: Record<string, AgentProviderEntry> = {}
    for (const [key, entry] of Object.entries(providers)) {
      next[key === oldId ? id : key] = entry
    }
    const model =
      oldId && agent.model?.startsWith(`${oldId}/`)
        ? `${id}/${agent.model.slice(oldId.length + 1)}`
        : agent.model
    onChange({ ...agent, provider: next, model })
  }

  const removeProvider = (id: string) => {
    const next = { ...providers }
    delete next[id]
    
    setModels((prev) => {
      if (!(id in prev)) return prev
      const { [id]: _removed, ...rest } = prev
      return rest
    })
    setModelErrors((prev) => {
      if (!(id in prev)) return prev
      const { [id]: _removed, ...rest } = prev
      return rest
    })
    const model = agent.model?.startsWith(`${id}/`) ? undefined : agent.model
    onChange({ ...agent, provider: Object.keys(next).length > 0 ? next : undefined, model })
  }

  const addProvider = () => {
    let id = "provider"
    for (let n = 2; providers[id]; n++) id = `provider${n}`
    setProvider(id, { npm: "@ai-sdk/openai-compatible" })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Agent</CardTitle>
        <CardDescription>
          The agent model that drives the local tools. Changes apply to the next message; no restart
          needed.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex max-h-[60vh] flex-col gap-4 overflow-y-auto pr-1">
        <Field>
          <FieldLabel htmlFor="agent-model">Active model</FieldLabel>
          <div className="flex flex-wrap items-center gap-2">
            {providerOptions.length > 0 ? (
              <Select
                value={modelProviderId || undefined}
                onValueChange={(v) => setModelRef(v ?? "", modelId)}
              >
                <SelectTrigger id="agent-model-provider" size="sm" className="w-52">
                  <SelectValue placeholder="Provider" />
                </SelectTrigger>
                <SelectContent>
                  {providerOptions.map((id) => (
                    <SelectItem key={id} value={id}>
                      {id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Input
                value={modelProviderId}
                onChange={(e) => setModelRef(e.target.value, modelId)}
                placeholder="provider"
                className="w-52"
              />
            )}
            <span className="text-muted-foreground">/</span>
            {canPick ? (
              <Select
                value={modelId || undefined}
                onValueChange={(v) =>
                  v === CUSTOM_MODEL ? setCustomModel(true) : setModelRef(modelProviderId, v ?? "")
                }
              >
                <SelectTrigger id="agent-model" size="sm" className="min-w-52 flex-1">
                  <SelectValue placeholder="Select a model" />
                </SelectTrigger>
                <SelectContent>
                  {modelOptions.map((id) => (
                    <SelectItem key={id} value={id}>
                      {id}
                    </SelectItem>
                  ))}
                  <SelectItem value={CUSTOM_MODEL}>Custom…</SelectItem>
                </SelectContent>
              </Select>
            ) : (
              <Input
                id="agent-model"
                value={modelId}
                onChange={(e) => setModelRef(modelProviderId, e.target.value)}
                placeholder="deepseek-chat"
                className="min-w-52 flex-1"
              />
            )}
            <Button
              variant="outline"
              size="icon"
              aria-label="Load the provider's models"
              title="Load the provider's models"
              onClick={() => activeEntry && void loadModels(modelProviderId, activeEntry)}
              disabled={!activeEntry || loadingModels}
              className="shrink-0"
            >
              {loadingModels ? <Loader2 className="animate-spin" /> : <RefreshCw />}
            </Button>
          </div>
          {refUnknown ? (
            <FieldError>
              No provider named “{modelProviderId}” — add one below or fix the reference.
            </FieldError>
          ) : modelErrors[modelProviderId] ? (
            <FieldDescription>Couldn't list models: {modelErrors[modelProviderId]}</FieldDescription>
          ) : modelList.length > 0 && !canPick ? (
            <button
              type="button"
              className="w-fit text-xs text-muted-foreground underline underline-offset-4"
              onClick={() => setCustomModel(false)}
            >
              Pick from {modelList.length} models
            </button>
          ) : (
            <FieldDescription>
              A <code className="rounded bg-muted px-1">{"<providerId>/<modelId>"}</code> ref into the
              providers below. Use the reload button to list the provider's models.
            </FieldDescription>
          )}
        </Field>

        <Separator />

        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <Label>Providers</Label>
            <Button variant="outline" size="sm" onClick={addProvider}>
              <Plus data-icon="inline-start" />
              Add provider
            </Button>
          </div>
          {renameError !== null && <FieldError>{renameError}</FieldError>}
          {ids.length === 0 ? (
            <p className="text-sm text-muted-foreground">No providers yet.</p>
          ) : (
            ids.map((id) => (
              <ProviderEditor
                key={`${id}:${editorReset[id] ?? 0}`}
                providerId={id}
                entry={providers[id]!}
                active={id === modelProviderId}
                onRename={(nextId) => renameProvider(id, nextId)}
                onChange={(entry) => setProvider(id, entry)}
                onRemove={() => removeProvider(id)}
              />
            ))
          )}
        </div>

        <Separator />

        <Field>
          <FieldLabel htmlFor="agent-system-prompt">System prompt (optional)</FieldLabel>
          <Textarea
            id="agent-system-prompt"
            value={agent.systemPrompt ?? ""}
            onChange={(e) => onChange({ ...agent, systemPrompt: e.target.value || undefined })}
            placeholder="Replaces the agent's built-in system prompt when set."
            rows={3}
          />
        </Field>

        <Field>
          <FieldLabel htmlFor="agent-max-steps">Max steps</FieldLabel>
          <Input
            id="agent-max-steps"
            type="number"
            min={1}
            value={agent.maxSteps ?? ""}
            onChange={(e) => {
              const value = Number(e.target.value)
              onChange({
                ...agent,
                maxSteps: e.target.value.trim() === "" || !Number.isFinite(value) ? undefined : value,
              })
            }}
            placeholder="Default"
            className="max-w-40"
          />
          <FieldDescription>Caps tool-calling iterations per turn.</FieldDescription>
        </Field>

        <Separator />

        <ToolSwitch
          id="agent-tool-local-models"
          label="Local models as tools"
          description="Expose installed ONNX models (image-to-image, text-to-speech) to the agent. Only added for tasks you have a model for."
          checked={tools.localModels !== false}
          onCheckedChange={(checked) => onChange({ ...agent, tools: { ...tools, localModels: checked } })}
        />
        <ToolSwitch
          id="agent-tool-knowledge"
          label="Knowledge search"
          description="Give the agent a read-only search_knowledge tool over ~/.nyx/knowledge."
          checked={tools.knowledge !== false}
          onCheckedChange={(checked) => onChange({ ...agent, tools: { ...tools, knowledge: checked } })}
        />
        <ToolSwitch
          id="agent-tool-web-search"
          label="Web search"
          description="Give the agent read-only web_search and web_fetch tools (Exa, or Parallel via NYX_WEB_SEARCH_PROVIDER)."
          checked={tools.webSearch !== false}
          onCheckedChange={(checked) => onChange({ ...agent, tools: { ...tools, webSearch: checked } })}
        />
      </CardContent>
    </Card>
  )
}

function ToolSwitch({
  id,
  label,
  description,
  checked,
  onCheckedChange,
}: {
  id: string
  label: string
  description: string
  checked: boolean
  onCheckedChange: (checked: boolean) => void
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0">
        <Label htmlFor={id}>{label}</Label>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  )
}
