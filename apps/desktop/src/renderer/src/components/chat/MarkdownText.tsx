import { memo } from "react"
import { Streamdown } from "streamdown"
import { code } from "@streamdown/code"
import { cjk } from "@streamdown/cjk"

const plugins = { code, cjk }

interface MarkdownTextProps {
  text: string
  /** Streaming assistant output: shows the caret and disables interactive controls. */
  isAnimating?: boolean
}

/**
 * Renders assistant markdown with Streamdown (incomplete-block parsing) plus the
 * code-highlight and CJK plugins. Mirrors ai-elements' `MessageResponse`: only
 * re-render when the text or animation state changes.
 */
export const MarkdownText = memo(
  function MarkdownText({ text, isAnimating = false }: MarkdownTextProps) {
    return (
      <Streamdown
        className="size-full text-sm leading-relaxed [&>*:first-child]:mt-0 [&>*:last-child]:mb-0"
        plugins={plugins}
        caret={isAnimating ? "block" : undefined}
        isAnimating={isAnimating}
      >
        {text}
      </Streamdown>
    )
  },
  (prev, next) => prev.text === next.text && prev.isAnimating === next.isAnimating,
)
