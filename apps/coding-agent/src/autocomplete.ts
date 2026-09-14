import { existsSync, readdirSync, type Dirent } from "node:fs";
import { delimiter, join, resolve } from "node:path";
import {
  CombinedAutocompleteProvider,
  type AutocompleteItem,
  type AutocompleteProvider,
  type AutocompleteSuggestions,
  type SlashCommand,
} from "@earendil-works/pi-tui";

/** Max `@file` items offered by the readdir fallback. */
const MAX_FILE_ITEMS = 20;
/** Directory listings are reused for this long, so typing in one dir scans once. */
const DIR_CACHE_TTL_MS = 1_000;

/** Locate `fd`/`fdfind` on PATH (enables fast, gitignore-aware file search). */
function findFd(): string | null {
  const names = process.platform === "win32" ? ["fd.exe"] : ["fd", "fdfind"];
  for (const dir of (process.env.PATH ?? "").split(delimiter)) {
    if (!dir) continue;
    for (const name of names) {
      const candidate = join(dir, name);
      if (existsSync(candidate)) return candidate;
    }
  }
  return null;
}

interface AtPrefix {
  /** The trailing `@…` token, used as the completion prefix. */
  prefix: string;
  /** Query after `@` (and any opening quote). */
  query: string;
  quoted: boolean;
}

/** Match a trailing `@…` token at a word boundary. */
function matchAtPrefix(line: string, cursorCol: number): AtPrefix | null {
  const match = /(^|\s)(@(?:"[^"]*"?|[^\s]*))$/.exec(line.slice(0, cursorCol));
  if (!match) return null;
  const prefix = match[2]!;
  const quoted = prefix.startsWith('@"');
  const inner = quoted ? prefix.slice(2) : prefix.slice(1);
  // Drop a closing quote so re-triggering on `@"done"|` still filters by the path.
  const query = quoted && inner.endsWith('"') ? inner.slice(0, -1) : inner;
  return { prefix, query, quoted };
}

/**
 * Editor autocomplete: `/` slash commands plus `@` workspace-file mentions.
 *
 * Delegates to pi-tui's CombinedAutocompleteProvider. When it yields nothing
 * (e.g. `fd` is not on PATH, or it finds no match), a bounded, briefly-cached
 * readdir fallback covers `@`; Tab-based path completion keeps working either way.
 */
export class WorkspaceAutocompleteProvider implements AutocompleteProvider {
  /** Typing `@` at a word boundary opens the file menu. */
  readonly triggerCharacters = ["@"];

  private readonly delegate: CombinedAutocompleteProvider;
  private readonly dirCache = new Map<string, { at: number; entries: Dirent[] }>();

  constructor(commands: SlashCommand[], private readonly basePath: string) {
    this.delegate = new CombinedAutocompleteProvider(commands, basePath, findFd());
  }

  async getSuggestions(
    lines: string[],
    cursorLine: number,
    cursorCol: number,
    options: { signal: AbortSignal; force?: boolean },
  ): Promise<AutocompleteSuggestions | null> {
    const suggestions = await this.delegate.getSuggestions(lines, cursorLine, cursorCol, options);
    if (suggestions) return suggestions;
    if (options.signal.aborted) return null;

    const at = matchAtPrefix(lines[cursorLine] ?? "", cursorCol);
    if (!at) return null;
    const items = this.fileItems(at);
    return items.length > 0 ? { items, prefix: at.prefix } : null;
  }

  applyCompletion(...args: Parameters<AutocompleteProvider["applyCompletion"]>) {
    return this.delegate.applyCompletion(...args);
  }

  shouldTriggerFileCompletion(
    ...args: Parameters<NonNullable<AutocompleteProvider["shouldTriggerFileCompletion"]>>
  ) {
    return this.delegate.shouldTriggerFileCompletion?.(...args) ?? true;
  }

  /** Bounded directory listing for `@` completion when the delegate has none. */
  private fileItems(at: AtPrefix): AutocompleteItem[] {
    const slash = at.query.lastIndexOf("/");
    const dirPart = slash === -1 ? "" : at.query.slice(0, slash + 1);
    const namePart = slash === -1 ? at.query : at.query.slice(slash + 1);

    const items: AutocompleteItem[] = [];
    for (const entry of this.listDir(resolve(this.basePath, dirPart || "."))) {
      if (namePart && !entry.name.toLowerCase().startsWith(namePart.toLowerCase())) continue;
      const isDir = entry.isDirectory();
      const path = `${dirPart}${entry.name}${isDir ? "/" : ""}`;
      const value = at.quoted || path.includes(" ") ? `@"${path}"` : `@${path}`;
      items.push({ value, label: entry.name + (isDir ? "/" : ""), description: path });
      if (items.length >= MAX_FILE_ITEMS) break;
    }
    return items;
  }

  /** `readdirSync` with a short TTL, so repeated keystrokes in one dir don't rescan. */
  private listDir(dir: string): Dirent[] {
    const now = Date.now();
    const cached = this.dirCache.get(dir);
    if (cached && now - cached.at < DIR_CACHE_TTL_MS) return cached.entries;
    let entries: Dirent[];
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      entries = [];
    }
    this.dirCache.set(dir, { at: now, entries });
    return entries;
  }
}
