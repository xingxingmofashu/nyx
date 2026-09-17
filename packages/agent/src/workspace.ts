import { realpathSync } from "node:fs";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import { Global } from "@nyx/global";
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

/**
 * Resolve a tool-supplied media path: workspace-relative as usual, or an
 * absolute path inside the workspace's session media folders (`attachments/`,
 * `images/`, `audio/` under `~/.nyx/sessions/<workspaceKey>/`). Those hold the
 * files the app itself produced for this workspace — user uploads and generated
 * media — so they stay reachable without exposing the rest of the sessions tree.
 *
 * `root` must be the workspace directory as the app keys it, i.e. *not*
 * symlink-resolved: `workspaceKey` (and therefore the folder the app writes to)
 * is derived from the raw path, so a realpath'd `root` would look in a
 * different, empty session folder.
 */
export function mediaPath(root: string, p: string): string {
  const workspace = new Global.Workspace(root);
  const roots = [root, workspace.attachmentsDir, workspace.imageDir, workspace.audioDir];
  const resolved = isAbsolute(p) ? resolve(p) : resolve(root, p);
  assertWithinAny(roots, resolved, p);
  assertWithinAny(roots.map(realpathNearest), realpathNearest(resolved), p);
  return resolved;
}

/** Throw when `target` is not `root` or a descendant of it. */
function assertWithin(root: string, target: string): void {
  if (!isWithinPath(root, target)) throw new Error(`path escapes workspace: ${target}`);
}

/** Throw when `target` is not inside any of `roots`. */
function assertWithinAny(roots: string[], target: string, input: string): void {
  if (!roots.some((root) => isWithinPath(root, target))) {
    throw new Error(`path escapes the workspace's media folders: ${input}`);
  }
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
