import { formatDistanceStrict } from "date-fns"
import { basename } from "pathe"

export function baseName(path: string): string {
  const trimmed = path.replace(/[\\/]+$/, "")
  return basename(trimmed)
}

export function formatJson(value: unknown, max = 4000): string {
  if (value === undefined) return ""
  const text = typeof value === "string" ? value : (JSON.stringify(value, null, 2) ?? String(value))
  return text.length > max ? `${text.slice(0, max)}\n… (truncated)` : text
}

export function relativeTime(iso: string, now: number = Date.now()): string {
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return ""
  if (now - then < 45_000) return "just now"
  return formatDistanceStrict(then, now, { addSuffix: true })
}

export function formatTokens(tokens: number): string {
  if (!Number.isFinite(tokens) || tokens <= 0) return "0"
  if (tokens < 1_000) return String(Math.round(tokens))
  if (tokens < 1_000_000) return `${(tokens / 1_000).toFixed(tokens < 10_000 ? 1 : 0)}k`
  return `${(tokens / 1_000_000).toFixed(1)}m`
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "—"
  const units = ["B", "KB", "MB", "GB", "TB"]
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)))
  return `${(bytes / 1024 ** i).toFixed(i === 0 ? 0 : 1)} ${units[i]}`
}
