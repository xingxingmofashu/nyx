import { Minus, Square, X } from "lucide-react"
import { Button } from "./ui/button"

/** Frameless title bar: drag region + brand + window controls. */
export function TitleBar() {
  return (
    <div className="drag flex h-11 shrink-0 items-center justify-between border-b bg-card pl-3">
      <span className="text-sm font-semibold">Nyx</span>
      <div className="no-drag flex">
        <Button variant="ghost" size="icon" className="size-9 rounded-none text-muted-foreground" onClick={() => window.nyx.window.minimize()} aria-label="Minimize">
          <Minus />
        </Button>
        <Button variant="ghost" size="icon" className="size-9 rounded-none text-muted-foreground" onClick={() => window.nyx.window.toggleMaximize()} aria-label="Maximize">
          <Square />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="size-9 rounded-none text-muted-foreground hover:bg-destructive hover:text-white"
          onClick={() => window.nyx.window.close()}
          aria-label="Close"
        >
          <X />
        </Button>
      </div>
    </div>
  )
}
