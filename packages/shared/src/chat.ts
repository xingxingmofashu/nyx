import { getToolName, isReasoningUIPart, isToolUIPart, type UIMessage } from "ai";
import { formatJson } from "./index.ts";

/**
 * AI-SDK-aware transcript helpers, isolated behind the `@nyx/shared/chat`
 * subpath so browser-only and Node consumers can opt out of the `ai` dependency.
 */

/** Title from the first user text part (first line, truncated); `fallback` when empty. */
export function sessionTitle(messages: UIMessage[], fallback = "New chat"): string {
  for (const message of messages) {
    if (message.role !== "user") continue;
    for (const part of message.parts) {
      if (part.type !== "text") continue;
      const firstLine = part.text.trim().split("\n")[0]?.trim() ?? "";
      if (!firstLine) continue;
      return firstLine.length > 48 ? `${firstLine.slice(0, 48)}…` : firstLine;
    }
  }
  return fallback;
}

/** Render a transcript as Markdown (text, reasoning, and tool calls). */
export function messagesToMarkdown(messages: UIMessage[]): string {
  const out: string[] = [];
  for (const message of messages) {
    out.push(message.role === "user" ? "## You" : "## Agent", "");
    for (const part of message.parts) {
      if (part.type === "text") {
        out.push(part.text);
      } else if (isReasoningUIPart(part)) {
        out.push(`> ${part.text.replace(/\n/g, "\n> ")}`);
      } else if (isToolUIPart(part)) {
        out.push(`**${getToolName(part)}**`, "", "```json", formatJson(part.input), "```");
        if (part.state === "output-available") {
          out.push("```json", formatJson(part.output), "```");
        } else if (part.state === "output-error") {
          out.push(`_Error: ${part.errorText}_`);
        }
      }
    }
    out.push("");
  }
  return `${out.join("\n").trim()}\n`;
}
