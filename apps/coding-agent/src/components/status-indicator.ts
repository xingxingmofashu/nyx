import { Loader, type TUI } from "@earendil-works/pi-tui";
import { spinnerColor, mutedColor } from "../theme";

export class WorkingStatusIndicator extends Loader {
  constructor(ui: TUI, message = "Thinking…") {
    super(
      ui,
      spinnerColor,
      mutedColor,
      message,
    );
  }

  dispose(): void {
    this.stop();
  }
}
