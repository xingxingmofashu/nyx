import { memo } from "react"
import { Streamdown } from "streamdown"
import { code } from "@streamdown/code"
import { cjk } from "@streamdown/cjk"
import { cn } from "#lib/utils.ts"

const plugins = { code, cjk }

interface MarkdownTextProps {
  text: string
  
  isAnimating?: boolean
  
  mode?: "static" | "streaming"
  className?: string
}

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
