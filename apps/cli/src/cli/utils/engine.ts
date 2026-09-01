/**
 * Shared engine construction for nyx commands.
 *
 * v1 is minimal: a local ONNX LLM + the Agent wrapper. No tools, sessions,
 * or permissions yet.
 */

import { Agent } from "@nyx/core";
import { OnnxEmbeddingEngine, OnnxLLMProvider } from "@nyx/llm";

export interface EngineOptions {
  model?: string;
  noEmbed?: boolean;
}

export interface Engine {
  llm: OnnxLLMProvider;
  embedder: OnnxEmbeddingEngine | null;
  agent: Agent;
}

export function buildEngine(options: EngineOptions = {}): Engine {
  // Local ONNX LLM (Qwen2.5-0.5B-Instruct) — loads lazily on first use.
  const llm = new OnnxLLMProvider({
    ...(options.model ? { model: options.model } : {}),
  });

  const embedder = options.noEmbed ? null : new OnnxEmbeddingEngine();

  const agent = new Agent({ llm });

  return { llm, embedder, agent };
}
