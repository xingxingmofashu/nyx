import { Loader, type TUI } from "@earendil-works/pi-tui";
import { theme } from "../theme";

export class WorkingStatusIndicator extends Loader {
  constructor(ui: TUI, message = "Thinking…") {
    super(
      ui,
      (s) => theme.fg("accent", s),
      (s) => theme.fg("muted", s),
      message,
    );
  }

  dispose(): void {
    this.stop();
  }
}
