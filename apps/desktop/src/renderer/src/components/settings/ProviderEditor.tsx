import { useState } from "react"
import { Eye, EyeOff, Plus, Trash2 } from "lucide-react"
import type { AgentProviderEntry } from "../../types"
import { Button } from "../ui/button"
import { Input } from "../ui/input"
import { Label } from "../ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select"

/** AI SDK provider packages the agent supports (see @nyx/agent providers). */
const PROVIDER_PACKAGES = ["@ai-sdk/openai-compatible", "@ai-sdk/anthropic"] as const

interface HeaderRow {
  key: string
  value: string
}

export interface ProviderEditorProps {
  providerId: string
  entry: AgentProviderEntry
  active: boolean
  onRename: (nextId: string) => void
  onChange: (next: AgentProviderEntry) => void
  onRemove: () => void
}

/** One `agent.provider[<id>]` entry: the AI SDK package plus its options. */
export function ProviderEditor({
  providerId,
  entry,
  active,
  onRename,
  onChange,
  onRemove,
}: ProviderEditorProps) {
  const [revealed, setRevealed] = useState(false)
  const options = entry.options ?? {}
  const context = entry.limit?.context
  const output = entry.limit?.output

  const setOption = (patch: Partial<typeof options>) =>
    onChange({ ...entry, options: { ...options, ...patch } })

  const setContext = (raw: string) => {
    const value = raw.trim()
    onChange({ ...entry, limit: { ...entry.limit, context: value === "" ? undefined : value } })
  }

  const setOutput = (raw: string) => {
    const value = Number(raw)
    onChange({
      ...entry,
      limit: { ...entry.limit, output: raw.trim() === "" || !Number.isFinite(value) ? undefined : value },
    })
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border p-3">
      <div className="flex items-start gap-2">
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <Label htmlFor={`provider-id-${providerId}`}>
            Provider id {active && <span className="text-xs font-normal text-muted-foreground">(active model)</span>}
          </Label>
          <Input
            id={`provider-id-${providerId}`}
            value={providerId}
            onChange={(e) => onRename(e.target.value)}
            placeholder="deepseek"
            className="max-w-60"
          />
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`Remove provider ${providerId}`}
          onClick={onRemove}
          className="mt-6"
        >
          <Trash2 />
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`provider-npm-${providerId}`}>AI SDK package</Label>
          <Select value={entry.npm} onValueChange={(npm) => onChange({ ...entry, npm: npm ?? "" })}>
            <SelectTrigger id={`provider-npm-${providerId}`} size="sm" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PROVIDER_PACKAGES.map((pkg) => (
                <SelectItem key={pkg} value={pkg}>
                  {pkg}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`provider-name-${providerId}`}>Display name (optional)</Label>
          <Input
            id={`provider-name-${providerId}`}
            value={entry.name ?? ""}
            onChange={(e) => onChange({ ...entry, name: e.target.value || undefined })}
            placeholder="OpenCode Go"
          />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`provider-baseurl-${providerId}`}>Base URL</Label>
        <Input
          id={`provider-baseurl-${providerId}`}
          value={options.baseURL ?? ""}
          onChange={(e) => setOption({ baseURL: e.target.value || undefined })}
          placeholder="https://api.deepseek.com/v1"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`provider-modelsurl-${providerId}`}>Models URL (optional)</Label>
        <Input
          id={`provider-modelsurl-${providerId}`}
          value={entry.modelsUrl ?? ""}
          onChange={(e) => onChange({ ...entry, modelsUrl: e.target.value || undefined })}
          placeholder="Defaults to <base URL>/models"
        />
        <p className="text-xs text-muted-foreground">
          Used to list selectable models for this provider. Sent with the API key and extra headers above.
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`provider-apikey-${providerId}`}>API key</Label>
        <div className="flex gap-2">
          <Input
            id={`provider-apikey-${providerId}`}
            type={revealed ? "text" : "password"}
            value={options.apiKey ?? ""}
            onChange={(e) => setOption({ apiKey: e.target.value || undefined })}
            placeholder="sk-…"
            autoComplete="off"
          />
          <Button
            variant="outline"
            size="icon"
            aria-label={revealed ? "Hide API key" : "Show API key"}
            onClick={() => setRevealed((v) => !v)}
            className="shrink-0"
          >
            {revealed ? <EyeOff /> : <Eye />}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">Stored in plain text in ~/.nyx/settings.json.</p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`provider-context-${providerId}`}>Context window (optional)</Label>
          <Input
            id={`provider-context-${providerId}`}
            value={context ?? ""}
            onChange={(e) => setContext(e.target.value)}
            placeholder="128k"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`provider-output-${providerId}`}>Max output tokens (optional)</Label>
          <Input
            id={`provider-output-${providerId}`}
            type="number"
            min={1}
            value={output ?? ""}
            onChange={(e) => setOutput(e.target.value)}
            placeholder="4096"
          />
        </div>
      </div>

      <HeadersEditor
        key={providerId}
        value={options.headers ?? {}}
        onChange={(headers) =>
          setOption({ headers: Object.keys(headers).length > 0 ? headers : undefined })
        }
      />
    </div>
  )
}

/**
 * Key/value rows for `options.headers`. Rows live in local state because a row
 * being typed may not have a key yet; committed records drop empty keys.
 */
function HeadersEditor({
  value,
  onChange,
}: {
  value: Record<string, string>
  onChange: (next: Record<string, string>) => void
}) {
  const [rows, setRows] = useState<HeaderRow[]>(() =>
    Object.entries(value).map(([key, v]) => ({ key, value: v })),
  )

  const commit = (next: HeaderRow[]) => {
    setRows(next)
    const record: Record<string, string> = {}
    for (const row of next) {
      const key = row.key.trim()
      if (key) record[key] = row.value
    }
    onChange(record)
  }

  return (
    <div className="flex flex-col gap-1.5">
      <Label>Extra headers (optional)</Label>
      {rows.map((row, index) => (
        <div key={index} className="flex gap-2">
          <Input
            value={row.key}
            onChange={(e) => commit(rows.map((r, i) => (i === index ? { ...r, key: e.target.value } : r)))}
            placeholder="x-opencode-session"
          />
          <Input
            value={row.value}
            onChange={(e) => commit(rows.map((r, i) => (i === index ? { ...r, value: e.target.value } : r)))}
            placeholder="value"
          />
          <Button
            variant="ghost"
            size="icon"
            aria-label="Remove header"
            onClick={() => commit(rows.filter((_, i) => i !== index))}
            className="shrink-0"
          >
            <Trash2 />
          </Button>
        </div>
      ))}
      <div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setRows((prev) => [...prev, { key: "", value: "" }])}
        >
          <Plus data-icon="inline-start" />
          Add header
        </Button>
      </div>
    </div>
  )
}
