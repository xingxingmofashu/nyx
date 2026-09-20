import { realpathSync } from "node:fs"
import { basename, dirname, isAbsolute, join, resolve } from "node:path"
import isPathInside from "is-path-inside"
import { Global } from "@nyx/global"

export class Workspace {
  static isWithin(root: string, target: string): boolean {
    return target === root || isPathInside(target, root)
  }

  static resolve(root: string, path: string): string {
    const resolved = resolve(root, path)
    Workspace.assertWithin(root, resolved)
    Workspace.assertWithin(root, Workspace.realpathNearest(resolved))
    return resolved
  }

  static media(root: string, path: string): string {
    const workspace = new Global.Workspace(root)
    const roots = [root, workspace.attachmentsDir, workspace.imageDir, workspace.audioDir]
    const resolved = isAbsolute(path) ? resolve(path) : resolve(root, path)
    Workspace.assertWithinAny(roots, resolved, path)
    Workspace.assertWithinAny(roots.map(Workspace.realpathNearest), Workspace.realpathNearest(resolved), path)
    return resolved
  }

  static realpathNearest(path: string): string {
    try {
      return realpathSync(path)
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      if (code !== "ENOENT" && code !== "ENOTDIR") throw error
      const parent = dirname(path)
      if (parent === path) return path
      return join(Workspace.realpathNearest(parent), basename(path))
    }
  }

  private static assertWithin(root: string, target: string): void {
    if (!Workspace.isWithin(root, target)) throw new Error(`path escapes workspace: ${target}`)
  }

  private static assertWithinAny(roots: string[], target: string, input: string): void {
    if (!roots.some((root) => Workspace.isWithin(root, target))) {
      throw new Error(`path escapes the workspace's media folders: ${input}`)
    }
  }
}
