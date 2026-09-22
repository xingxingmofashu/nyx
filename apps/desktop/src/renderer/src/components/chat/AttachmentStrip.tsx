import { useEffect, useState } from "react"
import type { SavedAttachment } from "../../types"

function useAttachmentUrl(path: string): string | null {
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setUrl(null)
    void window.nyx.files
      .readDataUrl(path)
      .then((dataUrl) => {
        if (!cancelled) setUrl(dataUrl)
      })
      .catch(() => {
        if (!cancelled) setUrl(null)
      })
    return () => {
      cancelled = true
    }
  }, [path])

  return url
}

function AttachmentThumb({ attachment }: { attachment: SavedAttachment }) {
  const url = useAttachmentUrl(attachment.path)
  const className = "block overflow-hidden rounded-lg border bg-card/60"
  const content = url ? (
    <img src={url} alt={attachment.name} className="max-h-40 max-w-40 object-cover" />
  ) : (
    <div className="flex size-20 items-center justify-center px-2 text-center text-[10px] text-muted-foreground">
      {attachment.name}
    </div>
  )
  if (url && /^https?:\/\//i.test(url)) {
    return (
      <a href={url} target="_blank" rel="noreferrer" title={attachment.name} className={className}>
        {content}
      </a>
    )
  }
  return (
    <div title={attachment.name} className={className}>
      {content}
    </div>
  )
}

export function AttachmentStrip({ attachments }: { attachments: SavedAttachment[] }) {
  if (attachments.length === 0) return null
  return (
    <div className="flex flex-wrap justify-end gap-2">
      {attachments.map((attachment) => (
        <AttachmentThumb key={attachment.path} attachment={attachment} />
      ))}
    </div>
  )
}
