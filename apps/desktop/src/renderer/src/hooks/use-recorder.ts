import { useCallback, useEffect, useRef, useState } from "react"
import type { AudioSamples } from "../types"

/** Whisper expects 16 kHz mono input; the recorder always produces that. */
const TARGET_SAMPLE_RATE = 16000

/**
 * Capture microphone audio and hand it back as mono 16 kHz PCM samples.
 * Recording is decode-on-stop: `MediaRecorder` yields a compressed blob which
 * the renderer's `AudioContext` decodes and resamples to `TARGET_SAMPLE_RATE`.
 */
export function useRecorder() {
  const [recording, setRecording] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Blob[]>([])
  /** True while `getUserMedia` is in flight, so a second tap can't open two streams. */
  const startingRef = useRef(false)
  const unmountedRef = useRef(false)

  const release = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    recorderRef.current = null
    chunksRef.current = []
  }, [])

  // Stop the mic if the component unmounts while recording or opening. Reset the
  // flag in the effect body: StrictMode mounts/unmounts/remounts in dev, and the
  // simulated unmount would otherwise leave the hook permanently "unmounted".
  useEffect(() => {
    unmountedRef.current = false
    return () => {
      unmountedRef.current = true
      release()
    }
  }, [release])

  const start = useCallback(async () => {
    if (recorderRef.current || startingRef.current) return
    startingRef.current = true
    setError(null)
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("Microphone is unavailable in this context")
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      })
      // Unmounted while the permission prompt was up: don't leave the mic hot.
      if (unmountedRef.current) {
        stream.getTracks().forEach((track) => track.stop())
        return
      }
      const recorder = new MediaRecorder(stream)
      chunksRef.current = []
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }
      recorder.start()
      streamRef.current = stream
      recorderRef.current = recorder
      setRecording(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      startingRef.current = false
    }
  }, [])

  /** Stop recording and resolve the captured audio, or null on failure/empty. */
  const stop = useCallback(async (): Promise<AudioSamples | null> => {
    const recorder = recorderRef.current
    if (!recorder) return null
    const stopped = new Promise<void>((resolve) => {
      recorder.onstop = () => resolve()
    })
    recorder.stop()
    await stopped

    const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" })
    release()
    setRecording(false)
    if (blob.size === 0) return null

    try {
      const samples = await decodeMono16k(blob)
      return { samples, samplingRate: TARGET_SAMPLE_RATE }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      return null
    }
  }, [release])

  return { recording, error, start, stop }
}

/** Decode any browser-supported audio blob into mono Float32 samples at 16 kHz. */
async function decodeMono16k(blob: Blob): Promise<Float32Array> {
  const bytes = await blob.arrayBuffer()
  // Constructing the context at the target rate makes decodeAudioData resample.
  const context = new AudioContext({ sampleRate: TARGET_SAMPLE_RATE })
  try {
    const buffer = await context.decodeAudioData(bytes)
    const { numberOfChannels: channels, length } = buffer
    const samples = new Float32Array(length)
    for (let channel = 0; channel < channels; channel++) {
      const data = buffer.getChannelData(channel)
      for (let i = 0; i < length; i++) {
        samples[i] = (samples[i] ?? 0) + (data[i] ?? 0) / channels
      }
    }
    return samples
  } finally {
    void context.close()
  }
}
