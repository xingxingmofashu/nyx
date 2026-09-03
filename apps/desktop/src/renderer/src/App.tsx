import { useEffect } from "react"
import { HashRouter, Navigate, Route, Routes, useLocation } from "react-router-dom"
import { AppSidebar } from "./components/Sidebar"
import { ThemeToggle } from "./components/ThemeToggle"
import { TextGenerationPage } from "./pages/TextGenerationPage"
import { ImageToImagePage } from "./pages/ImageToImagePage"
import { SidebarProvider, SidebarTrigger } from "./components/ui/sidebar"
import { useModelsStore } from "./store/models"

const PAGE_TITLES: Record<string, string> = {
  "/text-generation": "Text generation",
  "/image-to-image": "Image to image",
}

function Shell() {
  const location = useLocation()
  const title = PAGE_TITLES[location.pathname] ?? "Nyx"

  // Register model-pull progress once; refresh list on mount.
  useEffect(() => {
    const unsubscribe = window.nyx.models.onProgress((p) => {
      useModelsStore.getState().updatePullProgress(p.modelId, p.percent, p.done)
      if (p.done) void useModelsStore.getState().load()
    })
    void useModelsStore.getState().load()
    return unsubscribe
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
                <ThemeToggle />
              </div>
            </header>
            <div className="flex min-h-0 flex-1 flex-col">
              <Routes>
                <Route path="/" element={<Navigate to="/text-generation" replace />} />
                <Route path="/text-generation" element={<TextGenerationPage />} />
                <Route path="/image-to-image" element={<ImageToImagePage />} />
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
      <Shell />
    </HashRouter>
  )
}
