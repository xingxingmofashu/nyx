import { Streamdown } from "streamdown"

/** Renders assistant markdown; Streamdown handles incomplete/streaming blocks. */
export function MarkdownText({ text }: { text: string }) {
  return <Streamdown className="text-sm leading-relaxed">{text}</Streamdown>
}
