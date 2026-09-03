export type Theme = "light" | "dark" | "system"

const STORAGE_KEY = "nyx-theme"

function systemDark(): boolean {
  return window.matchMedia("(prefers-color-scheme: dark)").matches
}

/** Apply the current theme to <html> (dark adds `.dark`, light removes it). */
export function applyTheme(theme: Theme): void {
  const dark = theme === "dark" || (theme === "system" && systemDark())
  document.documentElement.classList.toggle("dark", dark)
}

/** Read the persisted theme (falls back to system). */
export function getTheme(): Theme {
  const stored = localStorage.getItem(STORAGE_KEY)
  return stored === "light" || stored === "dark" || stored === "system" ? stored : "system"
}

export function setTheme(theme: Theme): void {
  localStorage.setItem(STORAGE_KEY, theme)
  applyTheme(theme)
}
