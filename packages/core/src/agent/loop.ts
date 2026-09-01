/**
 * Agent — the minimal chat interface of nyx.
 *
 * v1 is deliberately tiny: one-shot local chat with an ONNX model.
 * No sessions, no tools, no permissions — those layers were cut to keep
 * the core simple. The LLM provider handles everything.
 */

import type { LLMProvider } from "@nyx/llm";

export interface ChatResult {
  /** The model's reply text. */
  text: string;
}

export class Agent {
  private llm: LLMProvider;
  private systemPrompt: string;

  constructor(options: {
    llm: LLMProvider;
    systemPrompt?: string;
  }) {
    this.llm = options.llm;
    this.systemPrompt =
      options.systemPrompt ??
      "You are nyx, a helpful local assistant. Answer concisely.";
  }

  /**
   * One-shot chat: send a single user message, get the reply.
   * No persistence, no history, no tools.
   */
  async chat(userText: string): Promise<ChatResult> {
    return this.chatStream(userText, () => {});
  }

  /**
   * One-shot chat with streaming deltas.
   *
   * `onDelta` is called with each chunk of generated text as it arrives,
   * so UIs can render progressively. Returns the full reply.
   */
  async chatStream(
    userText: string,
    onDelta: (delta: string) => void,
  ): Promise<ChatResult> {
    const messages = [
      { role: "system" as const, content: this.systemPrompt },
      { role: "user" as const, content: userText },
    ];

    let text = "";

    for await (const event of this.llm.stream(messages)) {
      switch (event.type) {
        case "text-delta":
          text += event.delta;
          onDelta(event.delta);
          break;
        case "error":
          throw new Error(event.message);
        default:
          break;
      }
    }

    if (!text.trim()) text = "(no response)";
    return { text };
  }
}
