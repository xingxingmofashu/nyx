import { useEffect, useState } from "react"
import { baseName } from "../../lib/format"
import { ToolCardShell, type ToolPartState } from "./ToolCallCard"

interface ImageOutput {
  path?: string
  width?: number
  height?: number
}

function useImageDataUrl(output: ImageOutput | undefined): { url?: string; missing: boolean } {
  const [url, setUrl] = useState<string>()
  const [missing, setMissing] = useState(false)
  const path = output?.path

  useEffect(() => {
    setUrl(undefined)
    setMissing(false)
    if (!path) return
    let cancelled = false
    void window.nyx.files
      .readDataUrl(path)
      .then((dataUrl) => {
        if (cancelled) return
        if (dataUrl) setUrl(dataUrl)
        else setMissing(true)
      })
      .catch(() => {
        if (!cancelled) setMissing(true)
      })
    return () => {
      cancelled = true
    }
  }, [path])

  return { url, missing }
}

interface ImageCardProps {
  name: string
  state: ToolPartState
  output?: unknown
  errorText?: string
}

export function ImageCard({ name, state, output, errorText }: ImageCardProps) {
  
  const data = (typeof output === "string" ? undefined : output) as ImageOutput | undefined
  const { url, missing } = useImageDataUrl(data)
  const detail =
    typeof output === "string"
      ? output
      : data?.path
        ? `${baseName(data.path)}${data.width ? ` · ${data.width}×${data.height}` : ""}`
        : undefined

  return (
    <ToolCardShell name={name} state={state}>
      {url && <img src={url} alt="Generated image" className="max-h-80 w-auto rounded-lg border" />}
      {missing && <p className="text-xs text-muted-foreground">Image file is no longer available.</p>}
      {errorText && <p className="text-xs text-destructive">{errorText}</p>}
      {detail && <p className="text-xs text-muted-foreground">{detail}</p>}
    </ToolCardShell>
  )
}
