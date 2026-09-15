import isPathInside from "is-path-inside";

/**
 * Node-only helpers. This entry may import Node built-ins (via `is-path-inside`)
 * and must not be used from the desktop renderer; browser-safe helpers live in
 * the package root.
 */

/**
 * True when `target` is `root` or a descendant of it. Lexical (no symlink
 * resolution); callers that must also defeat symlinks realpath both sides.
 */
export function isWithinPath(root: string, target: string): boolean {
  return target === root || isPathInside(target, root);
}
