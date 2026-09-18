import { useState, type ReactNode } from "react"
import { ChevronRight, History, Minimize2 } from "lucide-react"
import { relativeTime } from "../../lib/format"
import type { UIMessage } from "ai"
import { isReasoningUIPart, isTextUIPart, isToolUIPart, getToolName } from "ai"
import { Badge } from "../ui/badge"
import { cn } from "#lib/utils.ts"
import { MarkdownText } from "../chat/MarkdownText"
import type { ContextCheckpoint } from "../../../../shared/types"

interface CompactionCardProps {
  checkpoint: ContextCheckpoint
  /** The summarized messages themselves, revealed on demand (folded away by default). */
  children?: ReactNode
}

/**
 * Marker for a context checkpoint: shows that earlier turns were summarized
 * (and how many), with the summary itself behind a disclosure. Rendered inline
 * where the assistant message carrying the checkpoint sits, so it reads as the
 * boundary between summarized and verbatim history. Everything the checkpoint
 * covers is folded into this card, so the visible conversation matches what the
 * model actually receives.
 */
export function CompactionCard({ checkpoint, children }: CompactionCardProps) {
  const [open, setOpen] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  return (
    <div className="w-full rounded-md border border-dashed bg-muted/20 text-sm">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left"
        aria-expanded={open}
      >
        <ChevronRight
          className={cn("size-3.5 shrink-0 text-muted-foreground transition-transform", open && "rotate-90")}
        />
        <Minimize2 className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="min-w-0 truncate text-xs text-muted-foreground">
          Summarized the earlier {checkpoint.coveredCount} messages
        </span>
        <span className="ms-auto flex shrink-0 items-center gap-1.5">
          <Badge variant="outline">{checkpoint.reason}</Badge>
          <span className="text-xs text-muted-foreground">{relativeTime(checkpoint.createdAt)}</span>
        </span>
      </button>
      {open && (
        <div className="space-y-2 border-t px-2.5 py-2">
          <MarkdownText text={checkpoint.summary} className="text-xs" />
          {children && (
            <div className="border-t pt-2">
              <button
                type="button"
                onClick={() => setHistoryOpen((value) => !value)}
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                aria-expanded={historyOpen}
              >
                <History className="size-3.5" />
                {historyOpen ? "Hide" : "Show"} the summarized messages
              </button>
              {historyOpen && <div className="mt-2">{children}</div>}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/**
 * Compact, read-only rendering of messages folded into a {@link CompactionCard}:
 * just role, text and the names of the tools that ran. They are summarized
 * history at this point, so the full transcript isn't worth the weight.
 */
export function FoldedMessages({ messages }: { messages: UIMessage[] }) {
  return (
    <div className="space-y-1.5">
      {messages.map((message) => {
        const text = message.parts
          .filter(isTextUIPart)
          .map((part) => part.text)
          .filter(Boolean)
          .join("\n")
        const reasoning = message.parts
          .filter(isReasoningUIPart)
          .map((part) => part.text)
          .filter(Boolean)
          .join("\n")
        const tools = message.parts.filter(isToolUIPart).map((part) => getToolName(part))
        const body = text || reasoning || (tools.length > 0 ? tools.join(", ") : "")
        if (!body) return null
        return (
          <div key={message.id} className="rounded border bg-background/40 px-2 py-1.5">
            <div className="mb-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
              {message.role}
              {text ? "" : " (reasoning/tools)"}
            </div>
            <p className="line-clamp-3 whitespace-pre-wrap text-xs text-muted-foreground">{body}</p>
          </div>
        )
      })}
    </div>
  )
}
