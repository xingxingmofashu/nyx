import React from "react"
import ReactDOM from "react-dom/client"
import App from "./App"
import { applyTheme, getTheme } from "./lib/theme"
import "./assets/main.css"

// Apply the persisted/system theme before first paint.
applyTheme(getTheme())

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
