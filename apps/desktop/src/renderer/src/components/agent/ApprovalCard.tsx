import { ShieldAlert } from "lucide-react"
import { Button } from "../ui/button"
import { formatJson } from "../../lib/format"
import { findWorkspaceEscapes } from "../../lib/workspace-paths"
import { useAgentStore } from "../../store/agent"

interface ApprovalCardProps {
  name: string
  input: unknown
  /** Set once the user decided; the buttons are then replaced by the outcome. */
  decision?: "approved" | "denied"
  onApprove: () => void
  onDeny: () => void
}

/** The `command` string when a bash tool call is being approved. */
function bashCommand(name: string, input: unknown): string | null {
  if (name !== "bash" || typeof input !== "object" || input === null) return null
  const command = (input as { command?: unknown }).command
  return typeof command === "string" ? command : null
}

/** Render `command`, marking any substrings that resolve outside the workspace. */
function HighlightedCommand({ command, escapes }: { command: string; escapes: string[] }) {
  if (escapes.length === 0) return command
  const pattern = [...escapes]
    .sort((a, b) => b.length - a.length)
    .map((token) => token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("|")
  const flagged = new Set(escapes)
  return (
    <>
      {command.split(new RegExp(`(${pattern})`, "g")).map((part, index) =>
        flagged.has(part) ? (
          <mark key={index} className="rounded-sm bg-destructive/15 px-0.5 text-destructive">
            {part}
          </mark>
        ) : (
          <span key={index}>{part}</span>
        ),
      )}
    </>
  )
}

/** Inline approval prompt for a tool call that needs user consent. */
export function ApprovalCard({ name, input, decision, onApprove, onDeny }: ApprovalCardProps) {
  const workspaceDir = useAgentStore((s) => s.workspaceDir)
  const command = bashCommand(name, input)
  const escapes = command ? findWorkspaceEscapes(command, workspaceDir) : []
  const timeout =
    typeof input === "object" && input !== null && typeof (input as { timeoutMs?: unknown }).timeoutMs === "number"
      ? (input as { timeoutMs: number }).timeoutMs
      : null

  return (
    <div className="w-full rounded-md border border-dashed bg-card p-3 text-sm">
      <div className="flex items-center gap-2">
        <ShieldAlert className="size-4 shrink-0 text-muted-foreground" />
        <span className="font-medium">Approval required</span>
        <span className="min-w-0 truncate font-mono text-xs text-muted-foreground">{name}</span>
      </div>
      {escapes.length > 0 && (
        <p className="mt-2 rounded bg-destructive/10 px-2 py-1 text-xs text-destructive">
          References paths outside the workspace: {escapes.join(", ")}
        </p>
      )}
      <pre className="mt-2 max-h-40 overflow-auto rounded bg-muted/60 p-2 text-xs whitespace-pre">
        {command ? (
          <>
            <HighlightedCommand command={command} escapes={escapes} />
            {timeout !== null ? `\n(timeout ${timeout}ms)` : ""}
          </>
        ) : (
          formatJson(input)
        )}
      </pre>
      {decision ? (
        <p className="mt-2 text-xs text-muted-foreground">
          {decision === "approved" ? "Approved" : "Denied"}
        </p>
      ) : (
        <div className="mt-2 flex gap-2">
          <Button size="sm" onClick={onApprove}>
            Approve
          </Button>
          <Button size="sm" variant="outline" onClick={onDeny}>
            Deny
          </Button>
        </div>
      )}
    </div>
  )
}
