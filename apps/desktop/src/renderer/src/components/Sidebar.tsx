import { AudioLines, Bot, Boxes, Image as ImageIcon, Mic, Sparkles } from "lucide-react"
import { NavLink, useLocation } from "react-router-dom"
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

export type ViewId = "agent" | "image-to-image" | "text-to-speech" | "automatic-speech-recognition" | "models"

interface ViewDef {
  id: ViewId
  path: string
  label: string
  icon: typeof Bot
}

/** Navigation: the agent is primary; local tasks live under Tools. */
const NAV: Array<{ label?: string; views: ViewDef[] }> = [
  {
    views: [{ id: "agent", path: "/agent", label: "Agent", icon: Bot }],
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
    label: "Models",
    views: [{ id: "models", path: "/models", label: "Manage models", icon: Boxes }],
  },
]

/** Collapsible sidebar: agent, tools, and model management. */
export function AppSidebar() {
  const location = useLocation()

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
        {NAV.map((group) => (
          <SidebarGroup key={group.label ?? "primary"}>
            {group.label && (
              <SidebarGroupLabel className="group-data-[collapsible=icon]:hidden">{group.label}</SidebarGroupLabel>
            )}
            <SidebarGroupContent>
              <SidebarMenu>
                {group.views.map((v) => {
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
        ))}
      </SidebarContent>
    </Sidebar>
  )
}
