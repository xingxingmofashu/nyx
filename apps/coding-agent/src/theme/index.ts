import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { EditorTheme, MarkdownTheme, SelectListTheme } from "@earendil-works/pi-tui";
import chalk from "chalk";

const __dirname = dirname(fileURLToPath(import.meta.url));

type ColorValue = string | number;

interface ThemeJson {
  name: string;
  vars?: Record<string, ColorValue>;
  colors: Record<string, ColorValue>;
}

const themesDir = __dirname;
const themeJson: ThemeJson = JSON.parse(
  readFileSync(join(themesDir, "dark.json"), "utf-8"),
) as ThemeJson;

function resolveVarRefs(
  value: ColorValue,
  vars: Record<string, ColorValue>,
  visited = new Set<string>(),
): string | number {
  if (typeof value === "number" || value === "" || value.startsWith("#")) {
    return value;
  }
  if (visited.has(value)) {
    throw new Error(`Circular variable reference detected: ${value}`);
  }
  if (!(value in vars)) {
    throw new Error(`Variable reference not found: ${value}`);
  }
  visited.add(value);
  return resolveVarRefs(vars[value]!, vars, visited);
}

function resolveThemeColors(
  colors: Record<string, ColorValue>,
  vars: Record<string, ColorValue> = {},
): Record<string, string | number> {
  const resolved: Record<string, string | number> = {};
  for (const [key, value] of Object.entries(colors)) {
    resolved[key] = resolveVarRefs(value, vars);
  }
  return resolved;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const cleaned = hex.replace("#", "");
  if (cleaned.length !== 6) {
    throw new Error(`Invalid hex color: ${hex}`);
  }
  const r = parseInt(cleaned.substring(0, 2), 16);
  const g = parseInt(cleaned.substring(2, 4), 16);
  const b = parseInt(cleaned.substring(4, 6), 16);
  if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) {
    throw new Error(`Invalid hex color: ${hex}`);
  }
  return { r, g, b };
}

function fgAnsi(color: string | number): string {
  if (color === "") return "\x1b[39m";
  if (typeof color === "number") return `\x1b[38;5;${color}m`;
  if (color.startsWith("#")) {
    const { r, g, b } = hexToRgb(color);
    return `\x1b[38;2;${r};${g};${b}m`;
  }
  throw new Error(`Invalid color value: ${color}`);
}

function bgAnsi(color: string | number): string {
  if (color === "") return "\x1b[49m";
  if (typeof color === "number") return `\x1b[48;5;${color}m`;
  if (color.startsWith("#")) {
    const { r, g, b } = hexToRgb(color);
    return `\x1b[48;2;${r};${g};${b}m`;
  }
  throw new Error(`Invalid color value: ${color}`);
}

const bgColorKeys = new Set([
  "selectedBg",
  "userMessageBg",
  "customMessageBg",
  "toolPendingBg",
  "toolSuccessBg",
  "toolErrorBg",
]);

const resolved = resolveThemeColors(themeJson.colors, themeJson.vars);
const fgColors = new Map<string, string>();
const bgColors = new Map<string, string>();
for (const [key, value] of Object.entries(resolved)) {
  if (bgColorKeys.has(key)) {
    bgColors.set(key, bgAnsi(value));
  } else {
    fgColors.set(key, fgAnsi(value));
  }
}

export class Theme {
  fg(color: string, text: string): string {
    const ansi = fgColors.get(color);
    if (!ansi) throw new Error(`Unknown theme color: ${color}`);
    return `${ansi}${text}\x1b[39m`;
  }

  bg(color: string, text: string): string {
    const ansi = bgColors.get(color);
    if (!ansi) throw new Error(`Unknown theme background color: ${color}`);
    return `${ansi}${text}\x1b[49m`;
  }

  bold(text: string): string {
    return chalk.bold(text);
  }

  italic(text: string): string {
    return chalk.italic(text);
  }

  underline(text: string): string {
    return chalk.underline(text);
  }

  strikethrough(text: string): string {
    return chalk.strikethrough(text);
  }
}

export const theme = new Theme();

export function getMarkdownTheme(): MarkdownTheme {
  return {
    heading: (text: string) => theme.fg("mdHeading", text),
    link: (text: string) => theme.fg("mdLink", text),
    linkUrl: (text: string) => theme.fg("mdLinkUrl", text),
    code: (text: string) => theme.fg("mdCode", text),
    codeBlock: (text: string) => theme.fg("mdCodeBlock", text),
    codeBlockBorder: (text: string) => theme.fg("mdCodeBlockBorder", text),
    quote: (text: string) => theme.fg("mdQuote", text),
    quoteBorder: (text: string) => theme.fg("mdQuoteBorder", text),
    hr: (text: string) => theme.fg("mdHr", text),
    listBullet: (text: string) => theme.fg("mdListBullet", text),
    bold: (text: string) => theme.bold(text),
    italic: (text: string) => theme.italic(text),
    underline: (text: string) => theme.underline(text),
    strikethrough: (text: string) => theme.strikethrough(text),
  };
}

export function getSelectListTheme(): SelectListTheme {
  return {
    selectedPrefix: (text: string) => theme.fg("accent", text),
    selectedText: (text: string) => theme.fg("accent", text),
    description: (text: string) => theme.fg("muted", text),
    scrollInfo: (text: string) => theme.fg("muted", text),
    noMatch: (text: string) => theme.fg("muted", text),
  };
}

export function getEditorTheme(): EditorTheme {
  return {
    borderColor: (text: string) => theme.fg("borderMuted", text),
    selectList: getSelectListTheme(),
  };
}
