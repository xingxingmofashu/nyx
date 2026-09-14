/** Pretty-print a value for display in a tool card, truncated to stay readable. */
export function formatJson(value: unknown, max = 4000): string {
  if (value === undefined) return ""
  const text = typeof value === "string" ? value : (JSON.stringify(value, null, 2) ?? String(value))
  return text.length > max ? `${text.slice(0, max)}\n… (truncated)` : text
}

/** Last path segment, handling both separators. */
export function baseName(path: string): string {
  const trimmed = path.replace(/[\\/]+$/, "")
  return trimmed.split(/[\\/]/).pop() ?? trimmed
}
