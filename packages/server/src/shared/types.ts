/** Wire types for the nyx inference server HTTP API (shared server/client). */

export interface ImageInput {
  /** base64-encoded image bytes. */
  data: string
  mimeType: string
}

export interface ImagePayload {
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

/**
 * Transcript contract: `{ role, content }` turns fed straight to the
 * transformers.js pipeline (chat template applied internally). Each request
 * carries the full transcript; no session is stored server-side.
 */
export type { LLMMessage } from "@nyx/llm"

/**
 * Agent transcript: full message history, including prior assistant tool calls
 * and tool results / approval responses. Caller-owned; the server is stateless.
 */
export type { AgentEvent, ModelMessage } from "@nyx/agent"

/** POST /v1/agent body: one agent run over a full transcript. */
export interface AgentRequest {
  messages: import("@nyx/agent").ModelMessage[]
  /** Directory all file/bash tools are confined to; defaults to the server cwd. */
  workspaceDir?: string
  /** Overrides for the configured brain (env/settings are the default). */
  model?: string
  provider?: string
  baseUrl?: string
}
