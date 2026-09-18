import { cn } from "#lib/utils.ts"
import { formatTokens } from "../../lib/format"

interface ContextMeterProps {
  /** Input tokens reported for the last assistant turn (0 before the first turn). */
  used?: number
  /** The active agent model's context window, in tokens; omitted when unknown. */
  limit?: number
  /** True when `used` is the post-compaction estimate, not provider-reported usage. */
  estimated?: boolean
  className?: string
}

/**
 * How full the context window is, based on the provider-reported input tokens of
 * the most recent turn (the AI SDK's `finish` usage). Always rendered so the
 * budget is visible from the very first turn (at 0), and it drops visibly after a
 * compaction, which is the point of showing it. Without a known window
 * (no `limit.context`) only the count is shown.
 */
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
