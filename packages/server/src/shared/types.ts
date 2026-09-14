/** Wire types for the nyx inference server HTTP API (shared server/client). */

/** HTTP image input: base64-encoded image bytes (JSON request body). */
export interface ImageBase64Input {
  /** base64-encoded image bytes. */
  data: string
  mimeType: string
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
  /** Model ref override (`<providerId>/<modelId>`); defaults to agent.model. */
  model?: string
  /** Provider base URL override; defaults to the resolved provider's options. */
  baseURL?: string
}
