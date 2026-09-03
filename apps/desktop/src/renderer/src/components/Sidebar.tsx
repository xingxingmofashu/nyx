import { useEffect, useState } from "react"
import { Bot, Download, Image as ImageIcon, MessageSquare, RefreshCw, Sparkles } from "lucide-react"
import { NavLink, useLocation } from "react-router-dom"
import { useModelsStore } from "../store/models"
import type { ModelTask } from "../../../shared/types"
import { Button } from "./ui/button"
import { Input } from "./ui/input"
import { Progress } from "./ui/progress"
import { Field, FieldContent, FieldGroup, FieldLabel } from "./ui/field"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarSeparator,
} from "./ui/sidebar"

export type ViewId = "text-generation" | "image-to-image"

interface ViewDef {
  id: ViewId
  path: string
  label: string
  domain: string
  icon: typeof Bot
}

const VIEWS: ViewDef[] = [
  { id: "text-generation", path: "/text-generation", label: "Chat", domain: "Natural Language Processing", icon: MessageSquare },
  { id: "image-to-image", path: "/image-to-image", label: "Image", domain: "Computer Vision", icon: ImageIcon },
]

/** Collapsible sidebar: view menu on top, model list for the active view below. */
export function AppSidebar() {
  const { models, selected, pulling, load, select } = useModelsStore()
  const location = useLocation()
  const activeView = VIEWS.find((v) => location.pathname.startsWith(v.path)) ?? VIEWS[0]!
  const task = activeView.id
  const taskModels = models.filter((m) => m.task === task || m.task === "unknown")

  useEffect(() => {
    void load()
  }, [load])

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <div className="flex h-8 items-center gap-2 px-2 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0">
          <div className="flex size-6 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Sparkles className="size-4" />
          </div>
          <span className="truncate text-sm font-semibold group-data-[collapsible=icon]:hidden">Nyx</span>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="group-data-[collapsible=icon]:hidden">Menu</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {VIEWS.map((v) => {
                const Icon = v.icon
                return (
                  <SidebarMenuItem key={v.id}>
                    <SidebarMenuButton render={<NavLink to={v.path} />} isActive={v.path === location.pathname} tooltip={v.label}>
                      <Icon />
                      <span>{v.label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarSeparator />

        <SidebarGroup>
          <SidebarGroupLabel className="group-data-[collapsible=icon]:hidden">
            {activeView.domain}
          </SidebarGroupLabel>
          <SidebarGroupAction className="group-data-[collapsible=icon]:hidden">
            <Button variant="ghost" size="icon-sm" className="text-muted-foreground" onClick={() => void load()} aria-label="Refresh model list">
              <RefreshCw />
            </Button>
          </SidebarGroupAction>
          <SidebarGroupContent>
            {taskModels.length === 0 ? (
              <p className="px-2 text-xs text-muted-foreground/70 group-data-[collapsible=icon]:hidden">
                No {activeView.domain} models pulled yet.
              </p>
            ) : (
              <SidebarMenu>
                {taskModels.map((model) => {
                  const isSelected = selected[task] === model.id
                  const progress = pulling[model.id]
                  const Icon = activeView.icon
                  return (
                    <SidebarMenuItem key={model.id}>
                      <SidebarMenuButton isActive={isSelected} onClick={() => void select(task, model.id)} tooltip={model.name ?? model.id}>
                        <Icon />
                        <span className="truncate">{model.name ?? model.id}</span>
                        {model.dtype && <SidebarMenuBadge>{model.dtype}</SidebarMenuBadge>}
                      </SidebarMenuButton>
                      {progress !== undefined && (
                        <Progress value={progress} className="absolute inset-x-3 bottom-1 h-0.5" />
                      )}
                    </SidebarMenuItem>
                  )
                })}
              </SidebarMenu>
            )}
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <PullForm task={task} onPulled={() => void load()} />
      </SidebarFooter>
    </Sidebar>
  )
}

/** Pull a new model for the active view's task. */
function PullForm({ task, onPulled }: { task: ModelTask; onPulled: () => void }) {
  const { startPull } = useModelsStore()
  const [modelId, setModelId] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    const id = modelId.trim()
    if (!id || busy) return
    setBusy(true)
    setError(null)
    try {
      await startPull(id, task)
      setModelId("")
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
      onPulled()
    }
  }

  return (
    <div className="group-data-[collapsible=icon]:hidden">
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="model-id" className="sr-only">
            Model id
          </FieldLabel>
          <FieldContent>
            <div className="flex gap-1.5">
              <Input
                id="model-id"
                value={modelId}
                onChange={(e) => setModelId(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && void submit()}
                placeholder={`Pull ${task} model…`}
                aria-invalid={error ? true : undefined}
                className="h-8 min-w-0 flex-1 text-xs"
              />
              <Button size="sm" className="h-8 gap-1" onClick={() => void submit()} disabled={busy || !modelId.trim()}>
                <Download data-icon="inline-start" />
                {busy ? "…" : "Pull"}
              </Button>
            </div>
            {error && (
              <p className="mt-1 text-xs text-destructive" role="alert">
                {error}
              </p>
            )}
          </FieldContent>
        </Field>
      </FieldGroup>
    </div>
  )
}
