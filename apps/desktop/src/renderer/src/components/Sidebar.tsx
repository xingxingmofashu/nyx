import { Fragment } from "react"
import { AudioLines, BookOpen, Boxes, Image as ImageIcon, Mic, Sparkles, SquarePen } from "lucide-react"
import { NavLink, useLocation, useNavigate } from "react-router-dom"
import { SessionNav } from "./agent/SessionNav"
import { useSessionsStore } from "../store/sessions"
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
} from "./ui/sidebar"

export type ViewId =
  | "agent"
  | "knowledge"
  | "image-to-image"
  | "text-to-speech"
  | "automatic-speech-recognition"
  | "models"

interface ViewDef {
  id: ViewId
  path: string
  label: string
  icon: typeof SquarePen
}

/** Navigation: chats are primary; local tasks live under Tools. */
const NAV: Array<{ label?: string; views: ViewDef[] }> = [
  {
    views: [{ id: "agent", path: "/agent", label: "New chat", icon: SquarePen }],
  },
  {
    label: "Knowledge",
    views: [{ id: "knowledge", path: "/knowledge", label: "Knowledge base", icon: BookOpen }],
  },
  {
    label: "Tools",
    views: [
      { id: "image-to-image", path: "/image-to-image", label: "Image to image", icon: ImageIcon },
      { id: "text-to-speech", path: "/text-to-speech", label: "Text to speech", icon: AudioLines },
      { id: "automatic-speech-recognition", path: "/automatic-speech-recognition", label: "Automatic speech recognition", icon: Mic },
    ],
  },
  {
    label: "Local models",
    views: [{ id: "models", path: "/models", label: "Manage models", icon: Boxes }],
  },
]

/** Collapsible sidebar: new/current chat, knowledge, tools, and model management. */
export function AppSidebar() {
  const location = useLocation()
  const navigate = useNavigate()
  const createChat = useSessionsStore((s) => s.create)

  // The Agent entry doubles as "new chat": opening a saved one is the Chats
  // list's job. While a turn streams `create` is a no-op, so this degrades to
  // plain navigation back to the agent instead of dropping the live reply.
  const startNewChat = () => {
    createChat()
    navigate("/agent")
  }

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
        {NAV.map((group, index) => (
          <Fragment key={group.label ?? "primary"}>
            <SidebarGroup>
              {group.label && (
                <SidebarGroupLabel className="group-data-[collapsible=icon]:hidden">{group.label}</SidebarGroupLabel>
              )}
              <SidebarGroupContent>
                <SidebarMenu>
                  {group.views.map((v) => {
                    const Icon = v.icon
                    const isActive = v.path === location.pathname
                    return (
                      <SidebarMenuItem key={v.id}>
                        {v.id === "agent" ? (
                          <SidebarMenuButton isActive={isActive} onClick={startNewChat} tooltip={v.label}>
                            <Icon />
                            <span>{v.label}</span>
                          </SidebarMenuButton>
                        ) : (
                          <SidebarMenuButton render={<NavLink to={v.path} />} isActive={isActive} tooltip={v.label}>
                            <Icon />
                            <span>{v.label}</span>
                          </SidebarMenuButton>
                        )}
                      </SidebarMenuItem>
                    )
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
            {index === 0 && <SessionNav />}
          </Fragment>
        ))}
      </SidebarContent>
    </Sidebar>
  )
}
