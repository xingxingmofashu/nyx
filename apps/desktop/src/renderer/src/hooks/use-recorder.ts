import { useCallback, useEffect, useRef, useState } from "react"
import type { AudioSamples } from "../types"

const TARGET_SAMPLE_RATE = 16000

export function useRecorder() {
  const [recording, setRecording] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Blob[]>([])
  
  const startingRef = useRef(false)
  const unmountedRef = useRef(false)

  const release = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    recorderRef.current = null
    chunksRef.current = []
  }, [])

  
  
  
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

async function decodeMono16k(blob: Blob): Promise<Float32Array> {
  const bytes = await blob.arrayBuffer()
  
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
