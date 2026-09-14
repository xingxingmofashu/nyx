import { useEffect } from "react"
import { HashRouter, Navigate, Route, Routes, useLocation } from "react-router-dom"
import { AppSidebar } from "./components/Sidebar"
import { SettingsMenu } from "./components/SettingsMenu"
import { AgentPage } from "./pages/AgentPage"
import { TextGenerationPage } from "./pages/TextGenerationPage"
import { ImageToImagePage } from "./pages/ImageToImagePage"
import { TextToAudioPage } from "./pages/TextToAudioPage"
import { ModelsPage } from "./pages/ModelsPage"
import { SettingsPage } from "./pages/SettingsPage"
import { SidebarProvider, SidebarTrigger } from "./components/ui/sidebar"
import { Toaster, toast } from "./components/ui/toast"
import { useModelsStore } from "./store/models"
import { applyTheme, getTheme } from "./lib/theme"

const PAGE_TITLES: Record<string, string> = {
  "/agent": "Agent",
  "/text-generation": "Text generation",
  "/image-to-image": "Image to image",
  "/text-to-audio": "Text to audio",
  "/models": "Models",
  "/settings": "Settings",
}

function Shell() {
  const location = useLocation()
  const title = PAGE_TITLES[location.pathname] ?? "Nyx"

  // Register model-pull progress once; refresh list when a pull finishes.
  useEffect(() => {
    const unsubscribe = window.nyx.models.onProgress((p) => {
      useModelsStore.getState().updatePullProgress(p)
      if (p.done) {
        void useModelsStore.getState().load()
        if (p.error) {
          toast.add({
            title: `Pull failed: ${p.modelId}`,
            description: p.error,
            type: "error",
          })
        }
      }
    })
    void useModelsStore.getState().load()
    return unsubscribe
  }, [])

  // Follow OS preference changes while the theme is set to "system".
  useEffect(() => {
    const mql = window.matchMedia("(prefers-color-scheme: dark)")
    const onChange = () => {
      if (getTheme() === "system") applyTheme("system")
    }
    mql.addEventListener("change", onChange)
    return () => mql.removeEventListener("change", onChange)
  }, [])

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background">
      <SidebarProvider>
        <div className="flex min-h-0 flex-1">
          <AppSidebar />
          <main className="flex min-w-0 flex-1 flex-col">
            <header className="flex h-10 shrink-0 items-center gap-1.5 border-b bg-card px-2">
              <SidebarTrigger />
              <span className="text-xs font-medium text-muted-foreground">{title}</span>
              <div className="ms-auto">
                <SettingsMenu />
              </div>
            </header>
            <div className="flex min-h-0 flex-1 flex-col">
              <Routes>
                <Route path="/" element={<Navigate to="/agent" replace />} />
                <Route path="/agent" element={<AgentPage />} />
                <Route path="/text-generation" element={<TextGenerationPage />} />
                <Route path="/image-to-image" element={<ImageToImagePage />} />
                <Route path="/text-to-audio" element={<TextToAudioPage />} />
                <Route path="/models" element={<ModelsPage />} />
                <Route path="/settings" element={<SettingsPage />} />
              </Routes>
            </div>
          </main>
        </div>
      </SidebarProvider>
    </div>
  )
}

export default function App() {
  return (
    <HashRouter>
      <Toaster>
        <Shell />
      </Toaster>
    </HashRouter>
  )
}
