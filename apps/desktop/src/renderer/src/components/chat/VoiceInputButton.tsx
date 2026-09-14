import { useEffect, useState } from "react"
import { Mic, Square } from "lucide-react"
import { InputGroupButton } from "../ui/input-group"
import { Spinner } from "../ui/spinner"
import { toast } from "../ui/toast"
import { useRecorder } from "../../hooks/use-recorder"

interface VoiceInputButtonProps {
  /** Selected automatic-speech-recognition model id. */
  model?: string
  disabled?: boolean
  /** Receives the transcript once a recording is transcribed. */
  onTranscribed: (text: string) => void
}

/** Mic button: record, transcribe with the local ASR model, hand the text back. */
export function VoiceInputButton({ model, disabled, onTranscribed }: VoiceInputButtonProps) {
  const { recording, error, start, stop } = useRecorder()
  const [transcribing, setTranscribing] = useState(false)

  useEffect(() => {
    if (error) toast.add({ title: "Microphone error", description: error, type: "error" })
  }, [error])

  const toggle = async () => {
    if (transcribing) return
    if (!recording) {
      await start()
      return
    }
    const audio = await stop()
    if (!audio || !model) return
    setTranscribing(true)
    try {
      const { text } = await window.nyx.tasks.automaticSpeechRecognition.run(model, audio)
      if (text) onTranscribed(text)
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

  const noModel = !model
  // While recording, keep the button enabled so it can always be stopped, even
  // if the composer became busy (e.g. a typed message was sent mid-recording).
  const stopLocked = disabled && !recording
  return (
    <InputGroupButton
      size="icon-sm"
      variant={recording ? "destructive" : "secondary"}
      disabled={stopLocked || transcribing || noModel}
      onClick={() => void toggle()}
      onMouseDown={(e) => e.preventDefault()}
      aria-label={recording ? "Stop recording" : "Voice input"}
      title={
        noModel
          ? "Install an automatic speech recognition model in Manage models"
          : recording
            ? "Stop recording"
            : "Voice input"
      }
    >
      {transcribing ? <Spinner /> : recording ? <Square /> : <Mic />}
    </InputGroupButton>
  )
}
