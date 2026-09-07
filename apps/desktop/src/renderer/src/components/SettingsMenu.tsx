import { Settings2 } from "lucide-react"
import { useNavigate } from "react-router-dom"
import { Button } from "./ui/button"

/** Header gear button: opens the Settings page. */
export function SettingsMenu() {
  const navigate = useNavigate()
  return (
    <Button variant="ghost" size="icon-sm" aria-label="Open settings" onClick={() => navigate("/settings")}>
      <Settings2 />
    </Button>
  )
}
