import { useState, type ReactNode } from "react"
import { ChevronRight, Wrench } from "lucide-react"
import { Badge } from "../ui/badge"
import { Spinner } from "../ui/spinner"
import { formatJson } from "../../lib/format"
import { cn } from "#lib/utils.ts"

/** AI SDK tool UI part states we render. */
export type ToolPartState =
  | "input-streaming"
  | "input-available"
  | "approval-requested"
  | "approval-responded"
  | "output-available"
  | "output-error"
  | "output-denied"

const STATUS_LABEL: Record<ToolPartState, string> = {
  "input-streaming": "Running",
  "input-available": "Running",
  "approval-requested": "Waiting",
  "approval-responded": "Waiting",
  "output-available": "Done",
  "output-error": "Error",
  "output-denied": "Denied",
}

const STATUS_VARIANT: Record<ToolPartState, "secondary" | "destructive" | "outline"> = {
  "input-streaming": "outline",
  "input-available": "outline",
  "approval-requested": "outline",
  "approval-responded": "outline",
  "output-available": "secondary",
  "output-error": "destructive",
  "output-denied": "secondary",
}

const PENDING: ToolPartState[] = ["input-streaming", "input-available", "approval-requested", "approval-responded"]

interface ToolCallCardProps {
  name: string
  input: unknown
  state: ToolPartState
  output?: unknown
  errorText?: string
}

/**
 * Shared tool-call card chrome: a collapsible header (tool name + status badge)
 * with a body slot that stays folded away until the header is clicked. Collapsed
 * by default so long transcripts read as a list of what ran, not a wall of I/O.
 */
export function ToolCardShell({ name, state, children }: { name: string; state: ToolPartState; children: ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="w-full rounded-md border bg-muted/30 text-sm">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left"
        aria-expanded={open}
      >
        <ChevronRight
          className={cn("size-3.5 shrink-0 text-muted-foreground transition-transform", open && "rotate-90")}
        />
        <Wrench className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="min-w-0 truncate font-mono text-xs">{name}</span>
        <span className="ms-auto flex items-center gap-1.5">
          {PENDING.includes(state) && <Spinner className="size-3.5 text-muted-foreground" />}
          <Badge variant={STATUS_VARIANT[state]}>{STATUS_LABEL[state]}</Badge>
        </span>
      </button>
      {open && <div className="flex flex-col gap-2 border-t p-2.5">{children}</div>}
    </div>
  )
}

/** Compact card for one agent tool call: name, status, args and result. */
export function ToolCallCard({ name, input, state, output, errorText }: ToolCallCardProps) {
  const result = errorText ?? (output === undefined ? "" : formatJson(output))
  return (
    <ToolCardShell name={name} state={state}>
      {input !== undefined && (
        <pre className="max-h-40 overflow-auto rounded bg-background/60 p-2 text-xs whitespace-pre">
          {formatJson(input)}
        </pre>
      )}
      {result && (
        <pre className="max-h-64 overflow-auto rounded bg-background/60 p-2 text-xs whitespace-pre">
          {result}
        </pre>
      )}
    </ToolCardShell>
  )
}
