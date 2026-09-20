import { getToolName, isReasoningUIPart, isToolUIPart, type UIMessage } from "ai"
import { formatJson } from "./format"

export function settledMessages(messages: UIMessage[]): UIMessage[] {
  const settled: UIMessage[] = []
  for (const message of messages) {
    if (message.role !== "assistant") {
      settled.push(message)
      continue
    }
    const parts = message.parts.filter((part) => {
      const value = part as { type?: string; state?: string }
      if (value.type !== "dynamic-tool" && !value.type?.startsWith("tool-")) return true
      return (
        value.state === "output-available" ||
        value.state === "output-error" ||
        value.state === "output-denied" ||
        value.state === "approval-requested"
      )
    })
    if (parts.length === 0) continue
    settled.push(parts.length === message.parts.length ? message : { ...message, parts })
  }
  return settled
}

export function sessionTitle(messages: UIMessage[], fallback = "New chat"): string {
  for (const message of messages) {
    if (message.role !== "user") continue
    for (const part of message.parts) {
      if (part.type !== "text") continue
      const firstLine = part.text.trim().split("\n")[0]?.trim() ?? ""
      if (!firstLine) continue
      return firstLine.length > 48 ? `${firstLine.slice(0, 48)}…` : firstLine
    }
  }
  return fallback
}

export function messagesToMarkdown(messages: UIMessage[]): string {
  const out: string[] = []
  for (const message of messages) {
    out.push(message.role === "user" ? "## You" : "## Agent", "")
    for (const part of message.parts) {
      if (part.type === "text") {
        out.push(part.text)
      } else if (isReasoningUIPart(part)) {
        out.push(`> ${part.text.replace(/\n/g, "\n> ")}`)
      } else if (isToolUIPart(part)) {
        out.push(`**${getToolName(part)}**`, "", "```json", formatJson(part.input), "```")
        if (part.state === "output-available") {
          out.push("```json", formatJson(part.output), "```")
        } else if (part.state === "output-error") {
          out.push(`_Error: ${part.errorText}_`)
        }
      }
    }
    out.push("")
  }
  return `${out.join("\n").trim()}\n`
}
