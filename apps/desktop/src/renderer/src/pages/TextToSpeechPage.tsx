import { useCallback, useEffect, useRef, useState } from "react"
import { AudioLines, Sparkles, X } from "lucide-react"
import { useModelsStore } from "../store/models"
import type { AudioResult } from "../../../shared/types"
import { ModelPicker } from "../components/ModelPicker"
import { Button } from "../components/ui/button"
import { Input } from "../components/ui/input"
import { Label } from "../components/ui/label"
import { Spinner } from "../components/ui/spinner"
import { Textarea } from "../components/ui/textarea"

function toObjectUrl(result: AudioResult): string {
  const buf = result.data.buffer.slice(
    result.data.byteOffset,
    result.data.byteOffset + result.data.byteLength,
  ) as ArrayBuffer
  return URL.createObjectURL(new Blob([buf], { type: result.mimeType }))
}

interface AudioPreview {
  url: string
  samplingRate: number
  seconds: number | null
}

export function TextToSpeechPage() {
  const selectedModel = useModelsStore((s) => s.selected["text-to-speech"])
  const [text, setText] = useState("")
  const [speaker, setSpeaker] = useState("")
  const [speed, setSpeed] = useState("")
  const [result, setResult] = useState<AudioPreview | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const resultUrlRef = useRef<string | null>(null)

  useEffect(() => {
    return () => {
      if (resultUrlRef.current) URL.revokeObjectURL(resultUrlRef.current)
    }
  }, [])

  const clear = useCallback(() => {
    if (resultUrlRef.current) {
      URL.revokeObjectURL(resultUrlRef.current)
      resultUrlRef.current = null
    }
    setResult(null)
    setError(null)
  }, [])

  const run = async () => {
    const prompt = text.trim()
    if (!prompt || !selectedModel || busy) return
    setBusy(true)
    setError(null)
    try {
      const parsedSpeed = Number.parseFloat(speed)
      const output = await window.nyx.tasks.textToSpeech.run(selectedModel, {
        text: prompt,
        ...(speaker.trim() ? { speaker: speaker.trim() } : {}),
        ...(Number.isFinite(parsedSpeed) ? { speed: parsedSpeed } : {}),
      })
      if (resultUrlRef.current) URL.revokeObjectURL(resultUrlRef.current)
      const url = toObjectUrl(output)
      resultUrlRef.current = url
      setResult({ url, samplingRate: output.samplingRate, seconds: null })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="tts-text">Text</Label>
          <Textarea
            id="tts-text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Type the text to synthesize…"
            className="min-h-32"
          />
        </div>

        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <Label htmlFor="tts-speaker">Speaker embeddings (optional)</Label>
            <Input
              id="tts-speaker"
              value={speaker}
              onChange={(e) => setSpeaker(e.target.value)}
              placeholder="Path or URL to a .bin voice (models that need it)"
            />
          </div>
          <div className="flex w-full flex-col gap-1.5 sm:w-32">
            <Label htmlFor="tts-speed">Speed (optional)</Label>
            <Input
              id="tts-speed"
              type="number"
              step="0.1"
              min="0.1"
              value={speed}
              onChange={(e) => setSpeed(e.target.value)}
              placeholder="1.0"
            />
          </div>
        </div>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {result ? (
        <div className="flex flex-col gap-2 rounded-xl border bg-card/40 p-4">
          <p className="text-xs text-muted-foreground">
            Result — {result.samplingRate ? `${result.samplingRate} Hz` : "audio"}
            {result.seconds !== null ? ` · ${result.seconds.toFixed(1)}s` : ""}
          </p>
          <audio
            src={result.url}
            controls
            autoPlay
            className="w-full"
            onLoadedMetadata={(e) => {
              const seconds = e.currentTarget.duration
              if (Number.isFinite(seconds)) {
                setResult((prev) => (prev ? { ...prev, seconds } : prev))
              }
            }}
          />
        </div>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 rounded-xl border bg-card/40 py-10">
          <AudioLines className="size-5 text-muted-foreground/60" />
          <p className="text-xs text-muted-foreground/60">Generated audio appears here</p>
        </div>
      )}

      <div className="mt-auto flex items-center gap-3 border-t bg-card px-4 py-3">
        <ModelPicker task="text-to-speech" />
        <div className="ml-auto flex gap-2">
          <Button variant="secondary" onClick={clear} disabled={!result}>
            <X data-icon="inline-start" /> Clear
          </Button>
          <Button onClick={() => void run()} disabled={!text.trim() || !selectedModel || busy}>
            {busy ? (
              <>
                <Spinner data-icon="inline-start" /> Synthesizing…
              </>
            ) : (
              <>
                <Sparkles data-icon="inline-start" /> Run
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}
