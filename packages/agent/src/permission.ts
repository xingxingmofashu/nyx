import { homedir } from "node:os"
import { resolve } from "node:path"
import { z } from "zod/v4"
import type { Global } from "@nyx/global"

export const PermissionActionSchema = z.enum(["allow", "ask", "deny"])

export const PermissionRuleSchema = z.object({
  permission: z.string(),
  pattern: z.string(),
  action: PermissionActionSchema,
})

export const PermissionRulesetSchema = z.array(PermissionRuleSchema)

export type PermissionAction = z.infer<typeof PermissionActionSchema>
export type PermissionRule = z.infer<typeof PermissionRuleSchema>
export type PermissionRuleset = z.infer<typeof PermissionRulesetSchema>

export interface PermissionTarget {
  permission: string
  patterns: string[]
}

export interface PermissionDecision {
  action: PermissionAction
  permission: string
}

export class Permission {
  private static readonly APPROVALS = new Map<string, PermissionRuleset>()

  static match(value: string, pattern: string): boolean {
    const target = value.replaceAll("\\", "/")
    let escaped = pattern
      .replaceAll("\\", "/")
      .replace(/[.+^${}()|[\]\\]/g, "\\$&")
      .replace(/\*/g, ".*")
      .replace(/\?/g, ".")
    if (escaped.endsWith(" .*")) escaped = `${escaped.slice(0, -3)}( .*)?`
    return new RegExp(`^${escaped}$`, "s").test(target)
  }

  static fromConfig(config: Global.AgentPermissionSchemaType | undefined): PermissionRuleset {
    if (config === undefined) return []
    if (typeof config === "string") return [{ permission: "*", pattern: "*", action: config }]
    const ruleset: PermissionRuleset = []
    for (const [permission, value] of Object.entries(config)) {
      if (typeof value === "string") {
        ruleset.push({ permission, pattern: "*", action: value })
        continue
      }
      for (const [pattern, action] of Object.entries(value)) {
        ruleset.push({ permission, pattern: Permission.expand(pattern), action })
      }
    }
    return ruleset
  }

  static merge(...rulesets: PermissionRuleset[]): PermissionRuleset {
    return rulesets.flat()
  }

  static evaluate(permission: string, pattern: string, ruleset: PermissionRuleset): PermissionRule {
    return (
      Permission.last(
        ruleset,
        (rule) => Permission.match(permission, rule.permission) && Permission.match(pattern, rule.pattern),
      ) ?? { permission, pattern: "*", action: "ask" }
    )
  }

  static decide(targets: PermissionTarget[], ruleset: PermissionRuleset): PermissionDecision {
    let asking: string | undefined
    for (const target of targets) {
      for (const pattern of target.patterns) {
        const matching = ruleset.filter(
          (rule) => Permission.match(target.permission, rule.permission) && Permission.match(pattern, rule.pattern),
        )
        if (matching.some((rule) => rule.action === "deny")) {
          return { action: "deny", permission: target.permission }
        }
        if ((matching[matching.length - 1]?.action ?? "ask") === "ask" && asking === undefined) {
          asking = target.permission
        }
      }
    }
    if (asking !== undefined) return { action: "ask", permission: asking }
    return { action: "allow", permission: targets[0]?.permission ?? "*" }
  }

  static targets(toolName: string, input: unknown, workspaceDir: string): PermissionTarget[] {
    const primary = Permission.target(toolName, input)
    if (toolName !== "bash") return [primary]
    const escapes = Permission.escapes(Permission.text(Permission.record(input).command), workspaceDir)
    if (escapes.length === 0) return [primary]
    return [primary, { permission: "external_directory", patterns: escapes }]
  }

  static target(toolName: string, input: unknown): PermissionTarget {
    return { permission: toolName, patterns: Permission.patterns(toolName, Permission.record(input)) }
  }

  private static patterns(toolName: string, fields: Record<string, unknown>): string[] {
    switch (toolName) {
      case "bash": {
        const commands = Permission.commands(Permission.text(fields.command))
        return commands.length > 0 ? commands : ["*"]
      }
      case "write_file":
      case "edit_file":
      case "read_file":
      case "local_image_to_image":
        return [Permission.path(Permission.text(fields.path) || Permission.text(fields.inputPath))]
      case "glob":
        return [Permission.text(fields.pattern) || "*"]
      case "grep":
        return [Permission.path(Permission.text(fields.path)) || "*"]
      case "web_fetch":
        return [Permission.text(fields.url) || "*"]
      case "web_search":
        return [Permission.text(fields.query) || "*"]
      default:
        return ["*"]
    }
  }

  static visible<T>(tools: Record<string, T>, ruleset: PermissionRuleset): Record<string, T> {
    return Object.fromEntries(
      Object.entries(tools).filter(([toolName]) => !Permission.hidden(toolName, ruleset)),
    )
  }

  static allow(sessionId: string, rules: PermissionRuleset): void {
    const current = Permission.APPROVALS.get(sessionId) ?? []
    const added = rules.filter(
      (rule) =>
        !current.some(
          (existing) =>
            existing.permission === rule.permission &&
            existing.pattern === rule.pattern &&
            existing.action === rule.action,
        ),
    )
    if (added.length === 0) return
    Permission.APPROVALS.set(sessionId, [...current, ...added])
  }

  static grants(sessionId: string): PermissionRuleset {
    return Permission.APPROVALS.get(sessionId) ?? []
  }

  static revoke(sessionId: string): void {
    Permission.APPROVALS.delete(sessionId)
  }

  private static hidden(toolName: string, ruleset: PermissionRuleset): boolean {
    return ruleset.some(
      (rule) => rule.pattern === "*" && rule.action === "deny" && Permission.match(toolName, rule.permission),
    )
  }

  private static escapes(command: string, workspaceDir: string): string[] {
    const found = new Set<string>()
    for (const token of Permission.tokens(command)) {
      const value = token.replace(/^["']|["']$/g, "")
      if (value.length === 0) continue
      if (/^(?:~|\$(?:\{)?HOME(?:\})?)(?:[/\\]|$)/i.test(value)) {
        found.add(Permission.absolute(value, workspaceDir))
        continue
      }
      const absolute = value.startsWith("/") || /^[A-Za-z]:[\\/]/.test(value)
      const traversal = /(^|[/\\])\.\.([/\\]|$)/.test(value)
      if (absolute && !Permission.inside(value, workspaceDir)) found.add(Permission.normalize(Permission.path(value)))
      else if (!absolute && traversal) found.add(Permission.absolute(value, workspaceDir))
    }
    return [...found]
  }

  private static tokens(command: string): string[] {
    const raw = command.split(/[\s'"`|;&()<>]+/).filter((token) => token.length > 0)
    const tokens: string[] = []
    for (const token of raw) {
      const equals = token.indexOf("=")
      if (equals > 0) tokens.push(token.slice(equals + 1))
      tokens.push(token)
    }
    return tokens
  }

  private static absolute(value: string, workspaceDir: string): string {
    const expanded = value
      .replace(/^(?:~|\$(?:\{)?HOME(?:\})?)/i, homedir())
      .replace(/^["']|["']$/g, "")
    return Permission.path(resolve(workspaceDir, expanded))
  }

  private static inside(path: string, root: string): boolean {
    const target = Permission.normalize(path)
    const base = Permission.normalize(root)
    return target === base || target.startsWith(`${base}/`)
  }

  private static normalize(path: string): string {
    const absolute = path.startsWith("/")
    const parts: string[] = []
    for (const part of path.split("/")) {
      if (part === "" || part === ".") continue
      if (part === "..") {
        if (parts.length > 0 && parts[parts.length - 1] !== "..") parts.pop()
        else if (!absolute) parts.push("..")
        continue
      }
      parts.push(part)
    }
    return `${absolute ? "/" : ""}${parts.join("/")}`
  }

  private static last(
    ruleset: PermissionRuleset,
    predicate: (rule: PermissionRule) => boolean,
  ): PermissionRule | undefined {
    for (let index = ruleset.length - 1; index >= 0; index--) {
      const rule = ruleset[index]
      if (rule && predicate(rule)) return rule
    }
    return undefined
  }

  private static commands(command: string): string[] {
    return command
      .split(/\s*(?:&&|\|\||;|\|)\s*/)
      .map((part) => part.trim())
      .filter((part) => part.length > 0)
  }

  private static path(value: string): string {
    return value.replaceAll("\\", "/")
  }

  private static text(value: unknown): string {
    return typeof value === "string" ? value : ""
  }

  private static record(value: unknown): Record<string, unknown> {
    return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {}
  }

  private static expand(pattern: string): string {
    if (pattern.startsWith("~/")) return `${homedir()}${pattern.slice(1)}`
    if (pattern === "~") return homedir()
    if (pattern.startsWith("$HOME/")) return `${homedir()}${pattern.slice(5)}`
    if (pattern.startsWith("$HOME")) return `${homedir()}${pattern.slice(5)}`
    return pattern
  }
}
