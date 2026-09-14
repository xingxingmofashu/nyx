import { useEffect, useState } from "react"
import { ToolCardShell, type ToolPartState } from "./ToolCallCard"

/** Output shape of the `local_text_to_speech` agent tool. */
interface SpeechOutput {
  path?: string
  seconds?: number
  samplingRate?: number
  /** Legacy inline `data:` URL (older sessions); new results carry only `path`. */
  audio?: string
}

/** Load the generated WAV: inline when present, else read it back from the workspace. */
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
    void window.nyx.files.readDataUrl(path).then((dataUrl) => {
      if (cancelled) return
      if (dataUrl) setUrl(dataUrl)
      else setMissing(true)
    })
    return () => {
      cancelled = true
    }
  }, [inline, path])

  return { url, missing }
}

/** Decode a `data:` URL to an object URL so the CSP can keep `media-src` at `blob:`. */
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

/** Tool call ids whose audio already played, so remounting the page doesn't replay old replies. */
const played = new Set<string>()

interface SpeechCardProps {
  toolCallId: string
  name: string
  state: ToolPartState
  output?: unknown
  errorText?: string
}

/** Tool card for `local_text_to_speech`: plays the agent's spoken reply inline. */
export function SpeechCard({ toolCallId, name, state, output, errorText }: SpeechCardProps) {
  const data = (output ?? undefined) as SpeechOutput | undefined
  const { url: dataUrl, missing } = useSpeechDataUrl(data)
  const url = useObjectUrl(dataUrl)
  const detail = data?.path
    ? `${data.path}${data.seconds ? ` · ${data.seconds}s` : ""}${data.samplingRate ? ` @ ${data.samplingRate} Hz` : ""}`
    : undefined

  return (
    <ToolCardShell name={name} state={state}>
      {url && (
        <audio
          src={url}
          controls
          autoPlay={!played.has(toolCallId)}
          onPlay={() => played.add(toolCallId)}
          className="w-full"
        />
      )}
      {missing && <p className="text-xs text-muted-foreground">Audio file is no longer available.</p>}
      {errorText && <p className="text-xs text-destructive">{errorText}</p>}
      {detail && <p className="text-xs text-muted-foreground">{detail}</p>}
    </ToolCardShell>
  )
}
