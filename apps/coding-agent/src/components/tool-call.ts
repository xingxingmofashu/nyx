import { Container, Text } from "@earendil-works/pi-tui";
import { theme } from "../theme";

type ToolStatus = "pending" | "success" | "error" | "denied";

/**
 * Inline chat card for one tool call: shows the tool name + arguments and
 * updates with the result once the server reports it.
 */
export class ToolCallComponent extends Container {
  private readonly header: Text;
  private readonly body: Text;
  private status: ToolStatus = "pending";

  constructor(
    private readonly toolName: string,
    private readonly input: unknown,
  ) {
    super();
    this.header = new Text();
    this.body = new Text();
    this.addChild(this.header);
    this.addChild(this.body);
    this.refresh();
  }

  setResult(output: unknown): void {
    this.status = "success";
    this.body.setText(theme.fg("toolOutput", `  ${preview(output)}`));
    this.refresh();
  }

  setError(message: string): void {
    this.status = "error";
    this.body.setText(theme.fg("error", `  ${message}`));
    this.refresh();
  }

  setDenied(): void {
    this.status = "denied";
    this.body.setText(theme.fg("warning", "  denied by user"));
    this.refresh();
  }

  private refresh(): void {
    const bg =
      this.status === "pending"
        ? "toolPendingBg"
        : this.status === "success"
          ? "toolSuccessBg"
          : "toolErrorBg";
    const mark =
      this.status === "pending" ? "…" : this.status === "success" ? "✓" : this.status === "denied" ? "⊘" : "✗";
    this.header.setText(theme.bg(bg, theme.fg("toolTitle", ` ${mark} ${this.toolName}${argPreview(this.input)} `)));
  }
}

function argPreview(input: unknown): string {
  if (input === null || input === undefined) return "";
  if (typeof input === "object") {
    const entries = Object.entries(input as Record<string, unknown>);
    if (entries.length === 0) return "()";
    const [key, value] = entries[0]!;
    const text = typeof value === "string" ? value : JSON.stringify(value);
    return `(${key}: ${truncate(text ?? "", 60)}${entries.length > 1 ? ", …" : ""})`;
  }
  return `(${truncate(String(input), 60)})`;
}

function preview(output: unknown): string {
  const text = typeof output === "string" ? output : JSON.stringify(output);
  const firstLine = (text ?? "").split("\n").find((line) => line.trim().length > 0) ?? "";
  return truncate(firstLine, 120);
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}
