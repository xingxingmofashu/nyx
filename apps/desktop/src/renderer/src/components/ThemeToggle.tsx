import { useEffect, useState } from "react"
import { Check, Moon, Sun } from "lucide-react"
import { Button } from "./ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu"
import { applyTheme, getTheme, setTheme, type Theme } from "../lib/theme"

const THEMES: Array<{ id: Theme; label: string }> = [
  { id: "light", label: "Light" },
  { id: "dark", label: "Dark" },
  { id: "system", label: "System" },
]

/** Toggle between light / dark / system themes. */
export function ThemeToggle() {
  const [theme, setThemeState] = useState<Theme>(getTheme)
  const [isDark, setIsDark] = useState(() => document.documentElement.classList.contains("dark"))

  // Follow system preference changes while in "system" mode.
  useEffect(() => {
    const mql = window.matchMedia("(prefers-color-scheme: dark)")
    const onChange = () => {
      if (getTheme() === "system") applyTheme("system")
      setIsDark(document.documentElement.classList.contains("dark"))
    }
    mql.addEventListener("change", onChange)
    return () => mql.removeEventListener("change", onChange)
  }, [])

  const select = (t: Theme) => {
    setTheme(t)
    setThemeState(t)
    setIsDark(document.documentElement.classList.contains("dark"))
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="ghost" size="icon-sm" aria-label="Toggle theme">
            {isDark ? <Sun /> : <Moon />}
          </Button>
        }
      />
      <DropdownMenuContent align="end" className="w-32">
        {THEMES.map((t) => (
          <DropdownMenuItem key={t.id} onClick={() => select(t.id)}>
            {t.label}
            {theme === t.id && <Check className="ms-auto" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
