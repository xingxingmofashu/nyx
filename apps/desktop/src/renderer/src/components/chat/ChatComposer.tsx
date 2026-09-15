import type { ReactNode } from "react"
import { useEffect, useRef, useState } from "react"
import { ImagePlus, SendHorizonal, Square, X } from "lucide-react"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupTextarea,
} from "../ui/input-group"
import { CardFooter } from "../ui/card"
import { cn } from "#lib/utils.ts"

/** One file the user picked but has not sent yet (preview URL is an object URL). */
export interface PendingAttachment {
  id: string
  name: string
  /** Object URL for the local preview. */
  url: string
  file: File
}

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
  /** Files picked but not yet sent; rendered as removable chips. */
  attachments?: PendingAttachment[]
  /** Called with newly picked / dropped / pasted files. */
  onAttach?: (files: File[]) => void
  onRemoveAttachment?: (id: string) => void
}

/** Chat input with send/stop controls and image attachments; keeps focus after sending. */
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
  attachments = [],
  onAttach,
  onRemoveAttachment,
}: ChatComposerProps) {
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)
  // Sending disables the textarea while the agent streams, which blurs it; focus
  // it again once the composer is editable, but only for a send started here.
  const refocusAfterSend = useRef(false)

  const canAttach = Boolean(onAttach) && !disabled && !streaming

  const submit = () => {
    if (disabled || streaming || (!value.trim() && attachments.length === 0)) return
    refocusAfterSend.current = true
    onSend()
  }

  const addFiles = (files: FileList | File[] | null | undefined) => {
    if (!onAttach || !files) return
    const next = Array.from(files)
    if (next.length > 0) onAttach(next)
  }

  useEffect(() => {
    if (disabled || !refocusAfterSend.current) return
    refocusAfterSend.current = false
    inputRef.current?.focus()
  }, [disabled])

  return (
    <CardFooter className="flex-col gap-2 border-t p-2">
      {header && <div className="w-full px-1">{header}</div>}
      <form
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
        onDragOver={(e) => {
          if (!canAttach) return
          e.preventDefault()
          setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          if (!canAttach) return
          e.preventDefault()
          setDragOver(false)
          addFiles(e.dataTransfer.files)
        }}
        className="w-full"
      >
        {attachments.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-2">
            {attachments.map((file) => (
              <div
                key={file.id}
                className="flex max-w-48 items-center gap-2 rounded-lg border bg-card/60 p-1 pr-2"
              >
                <img src={file.url} alt={file.name} className="size-8 rounded object-cover" />
                <span className="truncate text-xs text-muted-foreground">{file.name}</span>
                <button
                  type="button"
                  aria-label={`Remove ${file.name}`}
                  className="shrink-0 text-muted-foreground hover:text-foreground"
                  onClick={() => onRemoveAttachment?.(file.id)}
                >
                  <X className="size-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
        <InputGroup className={cn(dragOver && "border-ring ring-3 ring-ring/50")}>
          <InputGroupTextarea
            ref={inputRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onPaste={(e) => {
              if (!canAttach) return
              const files = Array.from(e.clipboardData.files).filter((f) =>
                f.type.startsWith("image/"),
              )
              if (files.length === 0) return
              e.preventDefault()
              addFiles(files)
            }}
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
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => {
              addFiles(e.target.files)
              e.target.value = ""
            }}
          />
          <InputGroupAddon align="inline-end">
            {onAttach && (
              <InputGroupButton
                size="icon-sm"
                variant="ghost"
                disabled={!canAttach}
                onClick={() => fileInputRef.current?.click()}
                aria-label="Attach image"
              >
                <ImagePlus />
              </InputGroupButton>
            )}
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
                disabled={disabled || (!value.trim() && attachments.length === 0)}
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
