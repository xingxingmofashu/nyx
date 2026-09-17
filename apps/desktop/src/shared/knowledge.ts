/**
 * Import target: the folder inside the knowledge dir that imports are written
 * to, as a relative path. `""` is the knowledge root. Returns null for input
 * that could escape the knowledge dir (`.`/`..`/absolute) or name a hidden
 * folder, which is exactly what the server's path guard rejects.
 */
export function normalizeImportTarget(target: string): string | null {
  const segments = target
    .trim()
    .split("/")
    .filter((segment) => segment !== "")
  const valid = segments.every(
    (segment) => segment !== "." && segment !== ".." && !segment.startsWith("."),
  )
  return valid ? segments.join("/") : null
}
