/** Wire types for the nyx inference server HTTP API (shared server/client). */

/** HTTP image input: base64-encoded image bytes (JSON request body). */
export interface ImageBase64Input {
  /** base64-encoded image bytes. */
  data: string
  mimeType: string
}

/** Mono audio samples as they cross the IPC boundary (structured-cloneable). */
export interface AudioSamples {
  /** Mono PCM samples normalized to [-1, 1]. */
  samples: Float32Array
  /** Sample rate of `samples`, in Hz. */
  samplingRate: number
}

/** Raw image bytes as they cross the IPC boundary (structured-cloneable). */
export interface ImageBytes {
  /** Raw encoded image bytes (png/jpeg/webp). */
  data: Uint8Array
  mimeType: string
}

export interface ImageResult {
  data: Uint8Array
  mimeType: string
  width: number
  height: number
}

/** HTTP text-to-speech input (JSON request body). */
export interface TextToSpeechInput {
  /** Text to synthesize. */
  text: string
  /** Optional speaker/voice embeddings: a path/URL to a `.bin` file (models that require them). */
  speaker?: string
  /** Optional playback speed (models that support it). */
  speed?: number
}

/** Synthesized audio bytes as they cross the IPC boundary (structured-cloneable). */
export interface AudioResult {
  /** Encoded WAV bytes. */
  data: Uint8Array
  mimeType: string
  /** Sample rate of the waveform, in Hz. */
  samplingRate: number
}

/** HTTP automatic-speech-recognition input (JSON request body): mono Float32 PCM. */
export interface AutomaticSpeechRecognitionInput {
  /** base64-encoded little-endian Float32 samples (mono, 16 kHz). */
  audio: { data: string; samplingRate: number }
  /** Source language hint; omit to auto-detect. */
  language?: string
  /** `"transcribe"` (default) or `"translate"` (into English). */
  task?: "transcribe" | "translate"
}

/** Transcription result (JSON response body). */
export interface TranscriptResult {
  text: string
}

/**
 * Agent transcript: the AI SDK UI-message shape, including prior assistant
 * tool calls, their results, and approval responses. Caller-owned; the server
 * is stateless, so the client re-sends the whole transcript each turn.
 */
export type { UIMessage, UIMessageChunk } from "@nyx/agent"

/** POST /v1/agent body: one agent run over a full UI-message transcript. */
export interface AgentRequest {
  messages: import("@nyx/agent").UIMessage[]
  /** Directory all file/bash tools are confined to; defaults to the server cwd. */
  workspaceDir?: string
  /**
   * When true, local speech tools inline the generated audio in their result so
   * the client can play it (e.g. the desktop chat). Omitted, they play it aloud
   * on the server machine instead (for terminal clients).
   */
  inlineAudio?: boolean
}
