import { Minus, Square, X } from "lucide-react"
import { Button } from "./ui/button"
import { cn } from "../lib/utils"

export type ToolTab = "chat" | "image"

const TABS: Array<{ id: ToolTab; label: string }> = [
  { id: "chat", label: "Chat" },
  { id: "image", label: "Image Tools" },
]

/** Frameless title bar: drag region + tool tabs + window controls. */
export function TitleBar({ tab, onTabChange }: { tab: ToolTab; onTabChange: (tab: ToolTab) => void }) {
  return (
    <div className="drag flex h-11 shrink-0 items-center justify-between border-b bg-card pl-3">
      <div className="flex items-center gap-3">
        <span className="text-sm font-semibold">Nyx</span>
        <div className="no-drag flex gap-1">
          {TABS.map((t) => (
            <Button
              key={t.id}
              variant="ghost"
              size="sm"
              onClick={() => onTabChange(t.id)}
              className={cn("text-muted-foreground", tab === t.id && "bg-muted text-foreground")}
            >
              {t.label}
            </Button>
          ))}
        </div>
      </div>
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
