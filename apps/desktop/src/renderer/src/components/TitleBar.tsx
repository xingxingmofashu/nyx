import { Minus, Square, X } from "lucide-react"

export type ToolTab = "chat" | "image"

export function TitleBar({ tab, onTabChange }: { tab: ToolTab; onTabChange: (tab: ToolTab) => void }) {
  return (
    <div className="drag-region flex h-10 shrink-0 items-center justify-between border-b border-zinc-800 bg-zinc-900 pl-3">
      <div className="flex items-center gap-1">
        <span className="mr-2 text-sm font-semibold text-zinc-300">Nyx</span>
        <div className="no-drag flex gap-1">
          {(
            [
              { id: "chat", label: "Chat" },
              { id: "image", label: "Image Tools" },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              onClick={() => onTabChange(t.id)}
              className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                tab === t.id
                  ? "bg-zinc-700 text-white"
                  : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>
      <div className="no-drag flex">
        <button
          className="flex h-9 w-11 items-center justify-center text-zinc-400 hover:bg-zinc-800 hover:text-white"
          onClick={() => window.nyx.window.minimize()}
          aria-label="Minimize"
        >
          <Minus size={15} />
        </button>
        <button
          className="flex h-9 w-11 items-center justify-center text-zinc-400 hover:bg-zinc-800 hover:text-white"
          onClick={() => window.nyx.window.toggleMaximize()}
          aria-label="Maximize"
        >
          <Square size={13} />
        </button>
        <button
          className="flex h-9 w-11 items-center justify-center text-zinc-400 hover:bg-red-500 hover:text-white"
          onClick={() => window.nyx.window.close()}
          aria-label="Close"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  )
}
