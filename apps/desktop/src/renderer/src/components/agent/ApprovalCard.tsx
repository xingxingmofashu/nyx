import { ShieldAlert } from "lucide-react"
import { Button } from "../ui/button"
import { formatJson } from "../../lib/format"

interface ApprovalCardProps {
  name: string
  input: unknown
  /** Set once the user decided; the buttons are then replaced by the outcome. */
  decision?: "approved" | "denied"
  onApprove: () => void
  onDeny: () => void
}

/** Inline approval prompt for a tool call that needs user consent. */
export function ApprovalCard({ name, input, decision, onApprove, onDeny }: ApprovalCardProps) {
  return (
    <div className="w-full rounded-md border border-dashed bg-card p-3 text-sm">
      <div className="flex items-center gap-2">
        <ShieldAlert className="size-4 shrink-0 text-muted-foreground" />
        <span className="font-medium">Approval required</span>
        <span className="min-w-0 truncate font-mono text-xs text-muted-foreground">{name}</span>
      </div>
      <pre className="mt-2 max-h-40 overflow-auto rounded bg-muted/60 p-2 text-xs whitespace-pre">
        {formatJson(input)}
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
