/**
 * Parse a context-window limit: a raw token count, or a `"128k"` / `"1m"` style
 * string. Returns `undefined` for anything unusable, so callers can tell "not
 * configured" apart from a real value (a made-up default would scale the meter
 * wrong).
 */
export function parseContextLimit(value: number | string | undefined): number | undefined {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) return Math.round(value)
  if (typeof value === "string") {
    const match = /^\s*([\d.]+)\s*([km])?\s*$/i.exec(value)
    if (match) {
      const scale = match[2]?.toLowerCase() === "k" ? 1_000 : match[2]?.toLowerCase() === "m" ? 1_000_000 : 1
      const scaled = Number(match[1]) * scale
      if (Number.isFinite(scaled) && scaled > 0) return Math.round(scaled)
    }
  }
  return undefined
}
