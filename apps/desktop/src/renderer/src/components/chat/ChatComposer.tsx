import type { ReactNode } from "react"
import { useRef } from "react"
import { SendHorizonal, Square } from "lucide-react"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupTextarea,
} from "../ui/input-group"
import { CardFooter } from "../ui/card"

interface ChatComposerProps {
  value: string
  onChange: (value: string) => void
  onSend: () => void
  onAbort?: () => void
  /** A run is in progress: show the stop button. */
  streaming?: boolean
  /** Prevent submitting (no model selected, awaiting approval, …). */
  disabled?: boolean
  placeholder?: string
  /** Optional row rendered above the input (e.g. a model picker). */
  header?: ReactNode
  /** Optional control rendered before the send/stop button (e.g. a mic). */
  trailing?: ReactNode
}

/** Chat input with send/stop controls; keeps focus after sending. */
export function ChatComposer({
  value,
  onChange,
  onSend,
  onAbort,
  streaming,
  disabled,
  placeholder,
  header,
  trailing,
}: ChatComposerProps) {
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const submit = () => {
    if (disabled || streaming || !value.trim()) return
    onSend()
    inputRef.current?.focus()
  }

  return (
    <CardFooter className="flex-col gap-2 border-t p-2">
      {header && <div className="w-full px-1">{header}</div>}
      <form
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
        className="w-full"
      >
        <InputGroup>
          <InputGroupTextarea
            ref={inputRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => {
              // Skip while an IME composition is in progress (e.g. Chinese input).
              if (e.nativeEvent.isComposing) return
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault()
                submit()
              }
            }}
            placeholder={placeholder}
            disabled={disabled}
            rows={5}
            className="max-h-48"
          />
          <InputGroupAddon align="inline-end">
            {trailing}
            {streaming ? (
              <InputGroupButton
                size="icon-sm"
                variant="secondary"
                onClick={onAbort}
                aria-label="Stop"
              >
                <Square />
              </InputGroupButton>
            ) : (
              <InputGroupButton
                type="submit"
                size="icon-sm"
                disabled={disabled || !value.trim()}
                aria-label="Send message"
                // Don't let the button steal focus from the composer.
                onMouseDown={(e) => e.preventDefault()}
              >
                <SendHorizonal />
              </InputGroupButton>
            )}
          </InputGroupAddon>
        </InputGroup>
      </form>
    </CardFooter>
  )
}
