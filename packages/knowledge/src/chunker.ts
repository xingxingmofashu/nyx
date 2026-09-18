import { MarkdownTextSplitter } from "@langchain/textsplitters"

export interface Chunk {
  text: string
  ordinal: number
}

export interface ChunkerOptions {
  chunkSize?: number
  chunkOverlap?: number
}

export class Chunker {
  private static readonly DEFAULT_CHUNK_SIZE = 480
  private static readonly DEFAULT_CHUNK_OVERLAP = 100

  static options(options: ChunkerOptions = {}): Required<ChunkerOptions> {
    const chunkSize = options.chunkSize ?? Chunker.DEFAULT_CHUNK_SIZE
    const chunkOverlap = Math.min(
      options.chunkOverlap ?? Chunker.DEFAULT_CHUNK_OVERLAP,
      Math.max(chunkSize - 1, 0),
    )
    return { chunkSize, chunkOverlap }
  }

  static async split(content: string, options: ChunkerOptions = {}): Promise<Chunk[]> {
    const { chunkSize, chunkOverlap } = Chunker.options(options)
    const splitter = new MarkdownTextSplitter({
      chunkSize,
      chunkOverlap,
      lengthFunction: Chunker.estimateTokens,
    })
    return (await splitter.splitText(content)).map((text, ordinal) => ({ text, ordinal }))
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
