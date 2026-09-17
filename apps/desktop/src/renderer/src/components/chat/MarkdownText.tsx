import { memo } from "react"
import { Streamdown } from "streamdown"
import { code } from "@streamdown/code"
import { cjk } from "@streamdown/cjk"
import { cn } from "#lib/utils.ts"

const plugins = { code, cjk }

interface MarkdownTextProps {
  text: string
  /** Streaming assistant output: shows the caret and disables interactive controls. */
  isAnimating?: boolean
  /** `static` renders complete markdown (previews) instead of streaming-safe parsing. */
  mode?: "static" | "streaming"
  className?: string
}

/**
 * Renders assistant markdown with Streamdown (incomplete-block parsing) plus the
 * code-highlight and CJK plugins. Mirrors ai-elements' `MessageResponse`: the
 * default `memo` shallow compare keeps it from re-rendering on unrelated parent
 * updates while streaming.
 */
export const MarkdownText = memo(function MarkdownText({
  text,
  isAnimating = false,
  mode = "streaming",
  className,
}: MarkdownTextProps) {
  return (
    <Streamdown
      className={cn(
        "size-full text-sm leading-relaxed [&>*:first-child]:mt-0 [&>*:last-child]:mb-0",
        className,
      )}
      plugins={plugins}
      mode={mode}
      caret={isAnimating ? "block" : undefined}
      isAnimating={isAnimating}
    >
      {text}
    </Streamdown>
  )
})
