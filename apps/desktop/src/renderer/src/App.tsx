import { useEffect } from "react"
import { HashRouter, Navigate, Route, Routes, useLocation } from "react-router-dom"
import { AppSidebar } from "./components/Sidebar"
import { SettingsMenu } from "./components/SettingsMenu"
import { AgentPage } from "./pages/AgentPage"
import { AutomaticSpeechRecognitionPage } from "./pages/AutomaticSpeechRecognitionPage"
import { ImageToImagePage } from "./pages/ImageToImagePage"
import { TextToSpeechPage } from "./pages/TextToSpeechPage"
import { ModelsPage } from "./pages/ModelsPage"
import { SettingsPage } from "./pages/SettingsPage"
import { SidebarInset, SidebarProvider, SidebarTrigger } from "./components/ui/sidebar"
import { Toaster, toast } from "./components/ui/toast"
import { useModelsStore } from "./store/models"
import { initSessionPersistence } from "./store/sessions"
import { applyTheme, getTheme } from "./lib/theme"

const PAGE_TITLES: Record<string, string> = {
  "/agent": "Agent",
  "/image-to-image": "Image to image",
  "/text-to-speech": "Text to speech",
  "/automatic-speech-recognition": "Automatic speech recognition",
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

  // Persist the active chat session whenever a turn settles (module-level guard).
  useEffect(() => {
    initSessionPersistence()
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
    <SidebarProvider className="h-svh overflow-hidden bg-background">
      <AppSidebar />
      <SidebarInset className="min-h-0 min-w-0 overflow-hidden">
        <header className="flex h-10 shrink-0 items-center gap-1.5 border-b bg-card px-2">
          <SidebarTrigger />
          <span className="text-xs font-medium text-muted-foreground">{title}</span>
          <div className="ms-auto">
            <SettingsMenu />
          </div>
        </header>
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <Routes>
            <Route path="/" element={<Navigate to="/agent" replace />} />
            <Route path="/agent" element={<AgentPage />} />
            <Route path="/image-to-image" element={<ImageToImagePage />} />
            <Route path="/text-to-speech" element={<TextToSpeechPage />} />
            <Route path="/automatic-speech-recognition" element={<AutomaticSpeechRecognitionPage />} />
            <Route path="/models" element={<ModelsPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Routes>
        </div>
      </SidebarInset>
    </SidebarProvider>
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
