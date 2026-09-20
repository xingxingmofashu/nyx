export const ATTACHMENT_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "image/bmp",
  "image/avif",
] as const

export const ATTACHMENT_ACCEPT = ATTACHMENT_MIME_TYPES.join(",")

export function isSupportedAttachment(type: string): boolean {
  return (ATTACHMENT_MIME_TYPES as readonly string[]).includes(type)
}
