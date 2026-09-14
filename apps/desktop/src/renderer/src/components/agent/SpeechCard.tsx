import { useEffect, useState } from "react"
import { ToolCardShell, type ToolPartState } from "./ToolCallCard"

/** Output shape of the `local_text_to_speech` agent tool. */
interface SpeechOutput {
  path?: string
  seconds?: number
  samplingRate?: number
  /** `data:audio/wav;base64,…`; present only when the client requested inline audio. */
  audio?: string
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
  const url = useObjectUrl(data?.audio)
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
      {errorText && <p className="text-xs text-destructive">{errorText}</p>}
      {detail && <p className="text-xs text-muted-foreground">{detail}</p>}
    </ToolCardShell>
  )
}
