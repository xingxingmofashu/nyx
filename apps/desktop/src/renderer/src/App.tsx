import { useEffect, useState } from "react"
import { TitleBar, type ToolTab } from "./components/TitleBar"
import { ModelSidebar } from "./components/ModelSidebar"
import { ChatView } from "./components/ChatView"
import { ImageToolsView } from "./components/ImageToolsView"
import { useModelsStore } from "./store/models"

export default function App() {
  const [tab, setTab] = useState<ToolTab>("chat")

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
      <TitleBar tab={tab} onTabChange={setTab} />
      <div className="flex min-h-0 flex-1">
        <ModelSidebar />
        <main className="flex min-w-0 flex-1 flex-col bg-background">
          {tab === "chat" ? <ChatView /> : <ImageToolsView />}
        </main>
      </div>
    </div>
  )
}
