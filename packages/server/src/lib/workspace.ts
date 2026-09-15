import { realpathSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { isWithinPath } from "@nyx/shared/node";

/**
 * Resolve `p` under `root`, rejecting paths that escape the workspace. Both the
 * lexical path and its symlink-resolved form are checked, so a symlink inside
 * the workspace cannot reach outside it.
 */
export function workspacePath(root: string, p: string): string {
  const resolved = resolve(root, p);
  assertWithin(root, resolved);
  assertWithin(root, realpathNearest(resolved));
  return resolved;
}

/** Throw when `target` is not `root` or a descendant of it. */
function assertWithin(root: string, target: string): void {
  if (!isWithinPath(root, target)) throw new Error(`path escapes workspace: ${target}`);
}

/** `realpath` the nearest existing ancestor, rejoining the missing tail. */
export function realpathNearest(p: string): string {
  try {
    return realpathSync(p);
  } catch {
    const parent = dirname(p);
    if (parent === p) return p;
    return join(realpathNearest(parent), basename(p));
  }
}
