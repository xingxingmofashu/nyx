export interface Chunk {
  heading: string
  text: string
  ordinal: number
}

interface Section {
  heading: string
  body: string
}

export class Chunker {
  private static readonly MAX_TOKENS = 480
  private static readonly OVERLAP_CHARS = 100
  private static readonly OVERLAP_TOKENS = Chunker.OVERLAP_CHARS
  private static readonly CONTENT_TOKENS = Chunker.MAX_TOKENS - Chunker.OVERLAP_TOKENS

  static split(content: string): Chunk[] {
    const chunks: Chunk[] = []
    for (const section of Chunker.splitSections(content)) {
      const prefix = section.heading ? `${section.heading}\n` : ""
      for (const piece of Chunker.splitText(section.body, Chunker.estimateTokens(prefix))) {
        chunks.push({ heading: section.heading, text: `${prefix}${piece}`, ordinal: chunks.length })
      }
    }
    return chunks
  }

  private static splitSections(content: string): Section[] {
    const sections: Section[] = []
    const breadcrumb: string[] = []
    let body: string[] = []

    const flush = () => {
      const text = body.join("\n").trim()
      const heading = breadcrumb.filter(Boolean).join(" \u203a ")
      if (text) sections.push({ heading, body: text })
      body = []
    }

    for (const line of content.replace(/\r\n?/g, "\n").split("\n")) {
      const match = /^(#{1,3})\s+(.*\S)\s*$/.exec(line)
      if (match) {
        flush()
        const level = match[1]!.length
        breadcrumb.length = Math.min(breadcrumb.length, level - 1)
        breadcrumb[level - 1] = match[2]!
        continue
      }
      body.push(line)
    }
    flush()
    return sections
  }

  private static splitText(text: string, prefixTokens = 0): string[] {
    const limit = Math.max(Chunker.CONTENT_TOKENS + Chunker.OVERLAP_TOKENS - prefixTokens, 1)
    const contentLimit = Math.max(limit - Chunker.OVERLAP_TOKENS, 1)
    const blocks = text
      .split(/\n{2,}/)
      .map((block) => block.trim())
      .filter(Boolean)
      .flatMap((block) => Chunker.splitLong(block, contentLimit))

    const chunks: string[] = []
    let buffer: string[] = []
    let tokens = 0

    const flush = () => {
      if (buffer.length) chunks.push(buffer.join("\n\n"))
      buffer = []
      tokens = 0
    }

    for (const block of blocks) {
      const blockTokens = Chunker.estimateTokens(block)
      if (tokens > 0 && tokens + blockTokens > limit) {
        const overlap = buffer.length ? Chunker.tail(buffer.join("\n\n")) : ""
        flush()
        if (overlap) {
          buffer.push(overlap)
          tokens = Chunker.estimateTokens(overlap)
        }
      }
      buffer.push(block)
      tokens += blockTokens + (buffer.length > 1 ? 1 : 0)
    }
    flush()
    return chunks
  }

  private static splitLong(block: string, budget: number): string[] {
    if (Chunker.estimateTokens(block) <= budget) return [block]
    const chars = Array.from(block)
    const parts: string[] = []
    let start = 0
    while (start < chars.length) {
      let end = start
      let tokens = 0
      while (end < chars.length) {
        const cost = Chunker.charTokenCost(chars[end]!)
        if (tokens + cost > budget) break
        tokens += cost
        end += 1
      }
      parts.push(chars.slice(start, end).join("").trim())
      if (end >= chars.length) break
      start = Math.max(end - Chunker.OVERLAP_CHARS, start + 1)
    }
    return parts.filter(Boolean)
  }

  private static tail(text: string): string {
    if (text.length <= Chunker.OVERLAP_CHARS) return text
    return text.slice(-Chunker.OVERLAP_CHARS).replace(/^\S*\s+/, "").trim()
  }

  private static estimateTokens(text: string): number {
    let tokens = 0
    for (const char of text) tokens += Chunker.charTokenCost(char)
    return Math.ceil(tokens)
  }

  private static charTokenCost(char: string): number {
    return char.codePointAt(0)! >= 0x2e80 ? 1 : 0.25
  }
}
