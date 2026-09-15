/** Wire types for the nyx inference server HTTP API (shared server/client). */

import { z } from "zod/v4";
import { LLM_TASKS } from "@nyx/llm";

/** HTTP image input: base64-encoded image bytes (JSON request body). */
export const ImageBase64InputSchema = z.object({
  /** base64-encoded image bytes. */
  data: z.string(),
  mimeType: z.string(),
});
export type ImageBase64Input = z.infer<typeof ImageBase64InputSchema>;

/** Body of POST /v1/tasks/image-to-image. */
export const ImageToImageRequestSchema = z.object({
  model: z.string().min(1),
  image: ImageBase64InputSchema,
});
export type ImageToImageRequest = z.infer<typeof ImageToImageRequestSchema>;

/** Mono audio samples as they cross the IPC boundary (structured-cloneable). */
export interface AudioSamples {
  /** Mono PCM samples normalized to [-1, 1]. */
  samples: Float32Array;
  /** Sample rate of `samples`, in Hz. */
  samplingRate: number;
}

/** Raw image bytes as they cross the IPC boundary (structured-cloneable). */
export interface ImageBytes {
  /** Raw encoded image bytes (png/jpeg/webp). */
  data: Uint8Array;
  mimeType: string;
}

export interface ImageResult {
  data: Uint8Array;
  mimeType: string;
  width: number;
  height: number;
}

/** HTTP text-to-speech input (JSON request body). */
export const TextToSpeechInputSchema = z.object({
  /** Text to synthesize. */
  text: z.string().trim().min(1),
  /** Optional speaker/voice embeddings: a path/URL to a `.bin` file (models that require them). */
  speaker: z.string().optional(),
  /** Optional playback speed (models that support it). */
  speed: z.number().optional(),
});
export type TextToSpeechInput = z.infer<typeof TextToSpeechInputSchema>;

/** Body of POST /v1/tasks/text-to-speech. */
export const TextToSpeechRequestSchema = z.object({
  model: z.string().min(1),
  text: z.string().trim().min(1),
  speaker: z.string().optional(),
  speed: z.number().optional(),
});
export type TextToSpeechRequest = z.infer<typeof TextToSpeechRequestSchema>;

/** Synthesized audio bytes as they cross the IPC boundary (structured-cloneable). */
export interface AudioResult {
  /** Encoded WAV bytes. */
  data: Uint8Array;
  mimeType: string;
  /** Sample rate of the waveform, in Hz. */
  samplingRate: number;
}

/** HTTP automatic-speech-recognition input (JSON request body): mono Float32 PCM. */
export const AutomaticSpeechRecognitionInputSchema = z.object({
  /** base64-encoded little-endian Float32 samples (mono, 16 kHz). */
  audio: z.object({ data: z.string(), samplingRate: z.number() }),
  /** Source language hint; omit to auto-detect. */
  language: z.string().optional(),
  /** `"transcribe"` (default) or `"translate"` (into English). */
  task: z.enum(["transcribe", "translate"]).optional(),
});
export type AutomaticSpeechRecognitionInput = z.infer<typeof AutomaticSpeechRecognitionInputSchema>;

/** Body of POST /v1/tasks/automatic-speech-recognition. */
export const AutomaticSpeechRecognitionRequestSchema = AutomaticSpeechRecognitionInputSchema.extend({
  model: z.string().min(1),
});
export type AutomaticSpeechRecognitionRequest = z.infer<typeof AutomaticSpeechRecognitionRequestSchema>;

/** Transcription result (JSON response body). */
export interface TranscriptResult {
  text: string;
}

/** Body of POST /v1/models/pull. */
export const ModelPullRequestSchema = z.object({
  model: z.string().min(1),
  task: z.enum(LLM_TASKS),
});
export type ModelPullRequest = z.infer<typeof ModelPullRequestSchema>;

/** Body of POST /v1/models/pull/cancel and DELETE /v1/models. */
export const ModelIdRequestSchema = z.object({ model: z.string().min(1) });
export type ModelIdRequest = z.infer<typeof ModelIdRequestSchema>;

/**
 * Agent transcript: the AI SDK UI-message shape, including prior assistant
 * tool calls, their results, and approval responses. Caller-owned; the server
 * is stateless, so the client re-sends the whole transcript each turn.
 */
export type { UIMessage, UIMessageChunk } from "@nyx/agent";

/** One file copied into the workspace's session folder, referenced by a chat attachment. */
export interface SavedAttachment {
  /** Absolute path inside the workspace's session folder. */
  path: string;
  name: string;
  mimeType: string;
  size: number;
}

/**
 * Metadata a client may put on a user UI message. Descriptors only — never the
 * bytes — so a persisted transcript stays small; the server turns each entry
 * into a workspace-path hint for the brain.
 */
export interface ChatMessageMetadata {
  attachments?: SavedAttachment[];
}

/** Non-transcript options of POST /v1/agent; `messages` is validated by the AI SDK. */
export const AgentOptionsSchema = z.object({
  /** Directory all file/bash tools are confined to; defaults to the server cwd. */
  workspaceDir: z.string().optional(),
  /**
   * Client-generated session id; names generated speech clips so deleting the
   * session also deletes its audio. Omitted for non-session clients.
   */
  sessionId: z.string().optional(),
  /**
   * When true, local speech tools inline the generated audio in their result so
   * the client can play it (e.g. the desktop chat). Omitted, they play it aloud
   * on the server machine instead (for terminal clients).
   */
  inlineAudio: z.boolean().optional(),
});
export type AgentOptions = z.infer<typeof AgentOptionsSchema>;

/**
 * Full POST /v1/agent body. `messages` is only shape-checked here (a non-empty
 * array); the route then validates each entry with the AI SDK's
 * `safeValidateUIMessages`. The schema exists so the RPC client gets a typed
 * request body.
 */
export const AgentRequestSchema = AgentOptionsSchema.extend({
  messages: z.array(z.unknown()).min(1),
});
export type AgentRequestInput = z.infer<typeof AgentRequestSchema>;

/** POST /v1/agent body: one agent run over a full UI-message transcript. */
export interface AgentRequest extends AgentOptions {
  messages: import("@nyx/agent").UIMessage[];
}

/** One retrieved passage from the local knowledge base. */
export interface KnowledgeSearchHit {
  /** Path of the source file, relative to the knowledge dir. */
  file: string;
  /** Heading breadcrumb within the file. */
  heading: string;
  text: string;
  /** Reciprocal-rank-fusion score (higher is better). */
  score: number;
}
