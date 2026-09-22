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
import { ATTACHMENT_ACCEPT, isSupportedAttachment } from "#lib/attachments.ts"
import { cn } from "#lib/utils.ts"

export interface PendingAttachment {
  id: string
  name: string
  
  url: string
  file: File
}

interface ChatComposerProps {
  value: string
  onChange: (value: string) => void
  onSend: () => void
  onAbort?: () => void
  
  streaming?: boolean
  
  disabled?: boolean
  placeholder?: string
  
  header?: ReactNode
  
  trailing?: ReactNode
  
  attachments?: PendingAttachment[]
  
  onAttach?: (files: File[]) => void
  onRemoveAttachment?: (id: string) => void
}

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
                isSupportedAttachment(f.type),
              )
              if (files.length === 0) return
              e.preventDefault()
              addFiles(files)
            }}
            onKeyDown={(e) => {
              
              if (e.nativeEvent.isComposing) return
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault()
                submit()
              }
            }}
            placeholder={placeholder}
            aria-label="Message the agent"
            disabled={disabled}
            rows={5}
            className="max-h-48"
          />
          <input
            ref={fileInputRef}
            type="file"
            accept={ATTACHMENT_ACCEPT}
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
