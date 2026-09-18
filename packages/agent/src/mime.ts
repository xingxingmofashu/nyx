import { lookup } from "mrmime";

/** Best-effort media MIME from a file extension; `fallback` when unknown. */
export function mimeFor(path: string, fallback = "application/octet-stream"): string {
  return lookup(path) ?? fallback;
}
