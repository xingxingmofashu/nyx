import { useEffect, useState } from "react"
import { Copy, Mic, Square } from "lucide-react"
import { useModelsStore } from "../store/models"
import { ModelPicker } from "../components/ModelPicker"
import { Button } from "../components/ui/button"
import { Label } from "../components/ui/label"
import { Spinner } from "../components/ui/spinner"
import { Textarea } from "../components/ui/textarea"
import { toast } from "../components/ui/toast"
import { useRecorder } from "../hooks/use-recorder"

/** Record from the mic and transcribe with the selected local ASR model. */
export function AutomaticSpeechRecognitionPage() {
  const selectedModel = useModelsStore((s) => s.selected["automatic-speech-recognition"])
  const { recording, error, start, stop } = useRecorder()
  const [transcribing, setTranscribing] = useState(false)
  const [transcript, setTranscript] = useState("")

  useEffect(() => {
    if (error) toast.add({ title: "Microphone error", description: error, type: "error" })
  }, [error])

  useEffect(() => {
    // Models can be pulled from the CLI while the app is running; refresh so a
    // freshly installed model becomes selectable without a restart.
    void useModelsStore.getState().load()
  }, [])

  const toggle = async () => {
    if (transcribing) return
    if (!recording) {
      await start()
      return
    }
    const audio = await stop()
    if (!audio || !selectedModel) return
    setTranscribing(true)
    try {
      const { text } = await window.nyx.tasks.automaticSpeechRecognition.run(selectedModel, audio)
      if (text) setTranscript((prev) => (prev ? `${prev} ${text}` : text))
      else toast.add({ title: "No speech detected" })
    } catch (e) {
      toast.add({
        title: "Transcription failed",
        description: e instanceof Error ? e.message : String(e),
        type: "error",
      })
    } finally {
      setTranscribing(false)
    }
  }

  const copy = async () => {
    await navigator.clipboard.writeText(transcript)
    toast.add({ title: "Copied transcript" })
  }

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
      <div className="flex flex-1 flex-col items-center justify-center gap-3 rounded-xl border bg-card/40 py-10">
        <Button
          variant={recording ? "destructive" : "default"}
          onClick={() => void toggle()}
          disabled={!selectedModel || transcribing}
        >
          {transcribing ? (
            <>
              <Spinner data-icon="inline-start" /> Transcribing…
            </>
          ) : recording ? (
            <>
              <Square data-icon="inline-start" /> Stop
            </>
          ) : (
            <>
              <Mic data-icon="inline-start" /> Record
            </>
          )}
        </Button>
        <p className="text-xs text-muted-foreground">
          {!selectedModel
            ? "Install an automatic speech recognition model in Manage models."
            : recording
              ? "Listening — press stop when you're done"
              : "Press record and speak"}
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="asr-transcript">Transcript</Label>
        <Textarea
          id="asr-transcript"
          value={transcript}
          readOnly
          placeholder="Transcribed text appears here…"
          className="min-h-40"
        />
      </div>

      <div className="mt-auto flex items-center gap-3 border-t bg-card px-4 py-3">
        <ModelPicker task="automatic-speech-recognition" />
        <div className="ml-auto flex gap-2">
          <Button variant="secondary" onClick={() => void copy()} disabled={!transcript}>
            <Copy data-icon="inline-start" /> Copy
          </Button>
          <Button variant="secondary" onClick={() => setTranscript("")} disabled={!transcript}>
            Clear
          </Button>
        </div>
      </div>
    </div>
  )
}
