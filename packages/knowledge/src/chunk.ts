export interface Chunk {
  /** Heading breadcrumb (Markdown `#`–`###`), empty when the file has none. */
  heading: string;
  /** Text handed to the embedding model; the breadcrumb is prepended for context. */
  text: string;
  /** 0-based order within the file. */
  ordinal: number;
}

/**
 * Chunking budget. multilingual-e5 caps at 512 tokens; we leave headroom for
 * the `passage:` prefix and special tokens. CJK is estimated at ~1 token/char,
 * other text at ~4 chars/token.
 */
const MAX_TOKENS = 480;
const OVERLAP_CHARS = 100;
/**
 * Overlap is prepended to the next chunk on top of its content, so a block may
 * only use `MAX_TOKENS - OVERLAP_TOKENS`. Worst case overlap is all-CJK, i.e.
 * ~1 token per overlap char.
 */
const OVERLAP_TOKENS = OVERLAP_CHARS;
const CONTENT_TOKENS = MAX_TOKENS - OVERLAP_TOKENS;

/** Split a Markdown/text file into heading-aware chunks. */
export function chunkDocument(content: string): Chunk[] {
  const chunks: Chunk[] = [];
  for (const section of splitSections(content)) {
    const prefix = section.heading ? `${section.heading}\n` : "";
    for (const piece of splitText(section.body, estimateTokens(prefix))) {
      chunks.push({ heading: section.heading, text: `${prefix}${piece}`, ordinal: chunks.length });
    }
  }
  return chunks;
}

interface Section {
  heading: string;
  body: string;
}

/** Split on `#`–`###` headings, keeping a `›`-joined breadcrumb per section. */
function splitSections(content: string): Section[] {
  const sections: Section[] = [];
  const breadcrumb: string[] = [];
  let body: string[] = [];

  const flush = () => {
    const text = body.join("\n").trim();
    const heading = breadcrumb.filter(Boolean).join(" \u203a ");
    if (text) sections.push({ heading, body: text });
    body = [];
  };

  for (const line of content.replace(/\r\n?/g, "\n").split("\n")) {
    const match = /^(#{1,3})\s+(.*\S)\s*$/.exec(line);
    if (match) {
      flush();
      const level = match[1]!.length;
      // Drop deeper breadcrumbs, keep shallower ones; skipped levels (e.g.
      // `##` after `#`) leave no empty segment once filtered above.
      breadcrumb.length = Math.min(breadcrumb.length, level - 1);
      breadcrumb[level - 1] = match[2]!;
      continue;
    }
    body.push(line);
  }
  flush();
  return sections;
}

/** Pack paragraphs into chunks under the token budget, with a small overlap. */
function splitText(text: string, prefixTokens = 0): string[] {
  // The heading prefix (added by the caller) counts toward the model's window.
  const limit = Math.max(CONTENT_TOKENS + OVERLAP_TOKENS - prefixTokens, 1);
  const contentLimit = Math.max(limit - OVERLAP_TOKENS, 1);
  const blocks = text
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .flatMap((block) => splitLong(block, contentLimit));

  const chunks: string[] = [];
  let buffer: string[] = [];
  let tokens = 0;

  const flush = () => {
    if (buffer.length) chunks.push(buffer.join("\n\n"));
    buffer = [];
    tokens = 0;
  };

  for (const block of blocks) {
    const blockTokens = estimateTokens(block);
    if (tokens > 0 && tokens + blockTokens > limit) {
      const overlap = buffer.length ? tail(buffer.join("\n\n")) : "";
      flush();
      if (overlap) {
        buffer.push(overlap);
        tokens = estimateTokens(overlap);
      }
    }
    buffer.push(block);
    tokens += blockTokens + (buffer.length > 1 ? 1 : 0);
  }
  flush();
  return chunks;
}

/** Hard-split a single oversized paragraph into overlapping windows. */
function splitLong(block: string, budget: number): string[] {
  if (estimateTokens(block) <= budget) return [block];
  const chars = Array.from(block);
  const parts: string[] = [];
  let start = 0;
  while (start < chars.length) {
    let end = start;
    let tokens = 0;
    while (end < chars.length) {
      const cost = charTokenCost(chars[end]!);
      if (tokens + cost > budget) break;
      tokens += cost;
      end += 1;
    }
    parts.push(chars.slice(start, end).join("").trim());
    if (end >= chars.length) break;
    start = Math.max(end - OVERLAP_CHARS, start + 1);
  }
  return parts.filter(Boolean);
}

/** Trailing slice of `text` used to overlap consecutive chunks. */
function tail(text: string): string {
  if (text.length <= OVERLAP_CHARS) return text;
  return text.slice(-OVERLAP_CHARS).replace(/^\S*\s+/, "").trim();
}

/** Rough token estimate: ~1 token per CJK char, ~4 chars/token otherwise. */
export function estimateTokens(text: string): number {
  let tokens = 0;
  for (const char of text) tokens += charTokenCost(char);
  return Math.ceil(tokens);
}

/** Per-character token cost used by both `estimateTokens` and `splitLong`. */
function charTokenCost(char: string): number {
  return char.codePointAt(0)! >= 0x2e80 ? 1 : 0.25;
}
