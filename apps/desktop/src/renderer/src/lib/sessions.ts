import { getToolName, isReasoningUIPart, isToolUIPart } from "ai"
import type { UIMessage } from "../../../shared/types"
import { formatJson } from "./format"

/** Unique-ish session id (no secure-context `crypto.randomUUID`). */
export function newSessionId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

/** Compact relative time for session lists ("5m ago", "3d ago", …). */
export function relativeTime(iso: string): string {
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return ""
  const seconds = Math.round((Date.now() - then) / 1000)
  if (seconds < 60) return "just now"
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.round(hours / 24)
  if (days < 30) return `${days}d ago`
  return new Date(iso).toLocaleDateString()
}

/** Title from the first user text part (first line, truncated); "New chat" when empty. */
export function sessionTitle(messages: UIMessage[]): string {
  for (const message of messages) {
    if (message.role !== "user") continue
    for (const part of message.parts) {
      if (part.type !== "text") continue
      const firstLine = part.text.trim().split("\n")[0]?.trim() ?? ""
      if (!firstLine) continue
      return firstLine.length > 48 ? `${firstLine.slice(0, 48)}…` : firstLine
    }
  }
  return "New chat"
}

/** Render a transcript as Markdown (text, reasoning, and tool calls). */
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
