import { lookup } from "mrmime";
import { nanoid } from "nanoid";
import { basename } from "pathe";

/**
 * Browser-safe helpers shared across the CLI, server, and desktop renderer.
 * Keep this entry free of the AI SDK and Node built-ins; AI-SDK-aware helpers
 * live in `@nyx/shared/chat`, and Node-only helpers in `@nyx/shared/node`.
 */

/** URL-safe unique id (nanoid); matches the session-id charset `[A-Za-z0-9_-]`. */
export function newId(): string {
  return nanoid();
}

const relativeTimeFormat = new Intl.RelativeTimeFormat("en", { numeric: "auto", style: "narrow" });

/** Unit sizes in seconds, largest first. */
const TIME_UNITS: ReadonlyArray<readonly [Intl.RelativeTimeFormatUnit, number]> = [
  ["year", 31_536_000],
  ["month", 2_592_000],
  ["week", 604_800],
  ["day", 86_400],
  ["hour", 3_600],
  ["minute", 60],
];

/** Compact relative time for lists ("just now", "5m ago", "3d ago", …). */
export function relativeTime(iso: string, now: number = Date.now()): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const seconds = Math.round((now - then) / 1000);
  if (seconds < 45) return "just now";
  for (const [unit, size] of TIME_UNITS) {
    if (seconds >= size) return relativeTimeFormat.format(-Math.round(seconds / size), unit);
  }
  return relativeTimeFormat.format(-seconds, "second");
}

/** Last path segment, handling both separators. */
export function baseName(path: string): string {
  const trimmed = path.replace(/[\\/]+$/, "");
  return basename(trimmed);
}

/** Best-effort media MIME from a file extension; `fallback` when unknown. */
export function mimeFor(path: string, fallback = "application/octet-stream"): string {
  return lookup(path) ?? fallback;
}

/** Pretty-print a value for display, truncated to stay readable. */
export function formatJson(value: unknown, max = 4000): string {
  if (value === undefined) return "";
  const text = typeof value === "string" ? value : (JSON.stringify(value, null, 2) ?? String(value));
  return text.length > max ? `${text.slice(0, max)}\n… (truncated)` : text;
}
