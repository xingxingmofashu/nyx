import { Bot, Boxes, Image as ImageIcon, MessageSquare, Settings2, Sparkles } from "lucide-react"
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

export type ViewId = "text-generation" | "image-to-image" | "models" | "settings"

interface ViewDef {
  id: ViewId
  path: string
  label: string
  icon: typeof Bot
}

/** Navigation menu grouped by AI domain. */
const DOMAINS: Array<{ name: string; views: ViewDef[] }> = [
  {
    name: "Natural Language Processing",
    views: [{ id: "text-generation", path: "/text-generation", label: "Text generation", icon: MessageSquare }],
  },
  {
    name: "Computer Vision",
    views: [{ id: "image-to-image", path: "/image-to-image", label: "Image to image", icon: ImageIcon }],
  },
  {
    name: "Models",
    views: [{ id: "models", path: "/models", label: "Manage models", icon: Boxes }],
  },
  {
    name: "System",
    views: [{ id: "settings", path: "/settings", label: "Settings", icon: Settings2 }],
  },
]

/** Collapsible sidebar: domain-grouped navigation menu. */
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
        {DOMAINS.map((domain) => (
          <SidebarGroup key={domain.name}>
            <SidebarGroupLabel className="group-data-[collapsible=icon]:hidden">{domain.name}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {domain.views.map((v) => {
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
