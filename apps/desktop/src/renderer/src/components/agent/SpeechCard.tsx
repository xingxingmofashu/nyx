import { useEffect, useRef, useState } from "react"
import { baseName } from "../../lib/format"
import { ToolCardShell, type ToolPartState } from "./ToolCallCard"

interface SpeechOutput {
  path?: string
  seconds?: number
  samplingRate?: number
  
  audio?: string
}

function useSpeechDataUrl(output: SpeechOutput | undefined): { url?: string; missing: boolean } {
  const [url, setUrl] = useState<string>()
  const [missing, setMissing] = useState(false)
  const inline = output?.audio
  const path = output?.path

  useEffect(() => {
    setUrl(undefined)
    setMissing(false)
    if (inline) {
      setUrl(inline)
      return
    }
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
  }, [inline, path])

  return { url, missing }
}

function useObjectUrl(dataUrl: string | undefined): string | undefined {
  const [url, setUrl] = useState<string>()
  useEffect(() => {
    setUrl(undefined)
    if (!dataUrl) return
    const comma = dataUrl.indexOf(",")
    if (comma < 0) return
    const binary = atob(dataUrl.slice(comma + 1))
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    const objectUrl = URL.createObjectURL(new Blob([bytes], { type: "audio/wav" }))
    setUrl(objectUrl)
    return () => URL.revokeObjectURL(objectUrl)
  }, [dataUrl])
  return url
}

interface SpeechCardProps {
  name: string
  state: ToolPartState
  output?: unknown
  errorText?: string
}

export function SpeechCard({ name, state, output, errorText }: SpeechCardProps) {
  const data = (output ?? undefined) as SpeechOutput | undefined
  const { url: dataUrl, missing } = useSpeechDataUrl(data)
  const url = useObjectUrl(dataUrl)
  const played = useRef(false)
  const detail = data?.path
    ? `${baseName(data.path)}${data.seconds ? ` · ${data.seconds}s` : ""}${data.samplingRate ? ` @ ${data.samplingRate} Hz` : ""}`
    : undefined

  return (
    <ToolCardShell name={name} state={state}>
      {url && (
        <audio
          src={url}
          controls
          autoPlay={!played.current}
          onPlay={() => {
            played.current = true
          }}
          className="w-full"
        />
      )}
      {missing && <p className="text-xs text-muted-foreground">Audio file is no longer available.</p>}
      {errorText && <p className="text-xs text-destructive">{errorText}</p>}
      {detail && <p className="text-xs text-muted-foreground">{detail}</p>}
    </ToolCardShell>
  )
}
