/**
 * Best-effort detection of paths a shell command references outside the
 * workspace, used to warn on the approval card. This is advisory only: values
 * built at runtime (variables, command substitution, globs) cannot be seen
 * here, so a clean result is not proof the command stays inside.
 */

/** POSIX-normalize a path without node:path (the renderer has no fs/path). */
function normalizePath(path: string): string {
  const absolute = path.startsWith("/")
  const out: string[] = []
  for (const part of path.split("/")) {
    if (part === "" || part === ".") continue
    if (part === "..") {
      if (out.length > 0 && out[out.length - 1] !== "..") out.pop()
      else if (!absolute) out.push("..")
      continue
    }
    out.push(part)
  }
  return (absolute ? "/" : "") + out.join("/")
}

function isInside(path: string, root: string): boolean {
  const p = normalizePath(path)
  const r = normalizePath(root)
  return p === r || p.startsWith(`${r}/`)
}

/** Candidate path tokens, including the value of `--flag=value` assignments. */
function pathTokens(command: string): string[] {
  const raw = command.split(/[\s'"`|;&()<>]+/).filter(Boolean)
  const out: string[] = []
  for (const token of raw) {
    const eq = token.indexOf("=")
    if (eq > 0) out.push(token.slice(eq + 1))
    out.push(token)
  }
  return out
}

export function findWorkspaceEscapes(command: string, workspaceDir: string): string[] {
  if (!workspaceDir) return []
  const found = new Set<string>()
  for (const token of pathTokens(command)) {
    const value = token.replace(/^["']|["']$/g, "")
    if (!value) continue
    if (/^(?:~|\$(?:\{)?HOME(?:\})?)(?:[/\\]|$)/i.test(value)) {
      found.add(value)
      continue
    }
    const absolute = value.startsWith("/") || /^[A-Za-z]:[\\/]/.test(value)
    const traversal = /(^|[/\\])\.\.([/\\]|$)/.test(value)
    if (absolute && !isInside(value, workspaceDir)) found.add(value)
    else if (!absolute && traversal) found.add(value)
  }
  return [...found]
}
