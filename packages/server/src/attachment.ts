import type { UIMessage } from "@nyx/core";
import type { ChatMessageMetadata } from "./schema";

/**
 * Attachments live in the workspace's session folder as real files; the brain
 * only learns their paths. Each user message carrying attachment metadata gets
 * an extra text part describing those paths, so tools like
 * `local_image_to_image` can be pointed at them. The bytes are never sent to
 * the model, so this works with text-only providers.
 */
export function withAttachmentNotes(messages: UIMessage[]): UIMessage[] {
  return messages.map((message) => {
    if (message.role !== "user") return message;
    const attachments = (message.metadata as ChatMessageMetadata | undefined)?.attachments;
    if (!attachments || attachments.length === 0) return message;

    const note = attachments
      .map(
        (a) =>
          `[Attached file: ${a.path} (${a.mimeType}, ${a.size} bytes). ` +
          "Pass this path as `inputPath` to local_image_to_image.]",
      )
      .join("\n");

    return { ...message, parts: [...message.parts, { type: "text" as const, text: `\n\n${note}` }] };
  });
}
