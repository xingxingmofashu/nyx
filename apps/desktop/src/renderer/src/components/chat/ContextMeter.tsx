import { cn } from "#lib/utils.ts"
import { formatTokens } from "../../lib/format"

interface ContextMeterProps {
  
  used?: number
  
  limit?: number
  
  estimated?: boolean
  className?: string
}

export function ContextMeter({ used = 0, limit, estimated, className }: ContextMeterProps) {
  const count = Math.max(0, used)
  const ratio = limit ? Math.min(1, count / limit) : 0
  const tone = ratio >= 0.85 ? "bg-destructive" : ratio >= 0.6 ? "bg-amber-500" : "bg-primary"
  const note = estimated ? "estimated" : "reported by the provider"
  return (
    <div
      className={cn("flex items-center gap-2 text-xs text-muted-foreground", className)}
      title={
        limit
          ? `${count.toLocaleString()} of ${limit.toLocaleString()} tokens (${note})`
          : `${count.toLocaleString()} tokens (${note})`
      }
    >
      <span className="tabular-nums">
        {estimated ? "≈" : ""}
        {formatTokens(count)}
        {limit ? ` / ${formatTokens(limit)}` : " tokens"}
      </span>
      <div className="h-1.5 w-20 overflow-hidden rounded-full bg-muted">
        <div
          className={cn("h-full rounded-full transition-[width]", limit ? tone : "bg-muted-foreground/40")}
          style={{ width: `${ratio * 100}%` }}
        />
      </div>
      {limit ? <span className="tabular-nums">{Math.round(ratio * 100)}%</span> : null}
    </div>
  )
}
