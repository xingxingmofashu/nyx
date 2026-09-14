import { useMemo, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import {
  Copy,
  Download,
  MessageSquare,
  MoreHorizontal,
  Pencil,
  Pin,
  PinOff,
  Plus,
  Search,
  Trash2,
} from "lucide-react"
import { baseName } from "../../lib/format"
import { relativeTime } from "../../lib/sessions"
import { useSessionsStore } from "../../store/sessions"
import {
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarInput,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
} from "../ui/sidebar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu"

/** Sidebar section listing saved agent chats, grouped by workspace. */
export function SessionNav() {
  const navigate = useNavigate()
  const sessions = useSessionsStore((s) => s.sessions)
  const activeId = useSessionsStore((s) => s.activeId)
  const busy = useSessionsStore((s) => s.busy)
  const create = useSessionsStore((s) => s.create)
  const open = useSessionsStore((s) => s.open)
  const rename = useSessionsStore((s) => s.rename)
  const setPinned = useSessionsStore((s) => s.setPinned)
  const duplicate = useSessionsStore((s) => s.duplicate)
  const remove = useSessionsStore((s) => s.remove)
  const exportSession = useSessionsStore((s) => s.exportSession)

  const [query, setQuery] = useState("")
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState("")
  const renameInput = useRef<HTMLInputElement>(null)
  const renameOpenedAt = useRef(0)

  const groups = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const matches = needle ? sessions.filter((s) => s.title.toLowerCase().includes(needle)) : sessions
    const byWorkspace = new Map<string, typeof sessions>()
    for (const session of matches) {
      const key = session.workspaceDir ?? ""
      const list = byWorkspace.get(key)
      if (list) list.push(session)
      else byWorkspace.set(key, [session])
    }
    return [...byWorkspace.entries()]
  }, [sessions, query])

  const startRename = (id: string, title: string) => {
    renameOpenedAt.current = Date.now()
    setRenamingId(id)
    setRenameValue(title)
  }

  const commitRename = () => {
    const title = renameValue.trim()
    if (renamingId && title) void rename(renamingId, title)
    setRenamingId(null)
  }

  const openSession = (id: string) => {
    void open(id)
    navigate("/agent")
  }

  return (
    <SidebarGroup>
      <SidebarGroupLabel>Chats</SidebarGroupLabel>
      <SidebarGroupAction onClick={() => void create()} title="New chat" disabled={busy}>
        <Plus />
      </SidebarGroupAction>
      <SidebarGroupContent className="flex flex-col gap-1">
        <div className="relative px-1 group-data-[collapsible=icon]:hidden">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <SidebarInput
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search chats"
            className="pl-7"
          />
        </div>

        {groups.length === 0 ? (
          <p className="px-2 py-1 text-xs text-muted-foreground group-data-[collapsible=icon]:hidden">
            {query ? "No matching chats" : "No chats yet"}
          </p>
        ) : (
          groups.map(([workspaceDir, items]) => (
            <div key={workspaceDir || "none"}>
              <div className="truncate px-2 pt-1 pb-0.5 text-xs text-sidebar-foreground/60 group-data-[collapsible=icon]:hidden">
                {workspaceDir ? baseName(workspaceDir) : "No workspace"}
              </div>
              <SidebarMenu>
                {items.map((session) => (
                  <SidebarMenuItem key={session.id}>
                    {renamingId === session.id ? (
                      <SidebarInput
                        ref={renameInput}
                        autoFocus
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onBlur={() => {
                          // Base UI returns focus to the menu trigger right after
                          // closing; don't mistake that for "clicked away".
                          if (Date.now() - renameOpenedAt.current < 300) {
                            requestAnimationFrame(() => renameInput.current?.focus())
                            return
                          }
                          commitRename()
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault()
                            commitRename()
                          } else if (e.key === "Escape") {
                            setRenamingId(null)
                          }
                        }}
                      />
                    ) : (
                      <>
                        <SidebarMenuButton
                          isActive={session.id === activeId}
                          onClick={() => openSession(session.id)}
                          disabled={busy}
                          tooltip={session.title}
                        >
                          {session.pinned ? <Pin /> : <MessageSquare />}
                          <span className="truncate">{session.title}</span>
                          <span className="ms-auto shrink-0 text-[10px] text-muted-foreground/70 group-data-[collapsible=icon]:hidden">
                            {relativeTime(session.updatedAt)}
                          </span>
                        </SidebarMenuButton>
                        <DropdownMenu>
                          <DropdownMenuTrigger
                            render={
                              <SidebarMenuAction showOnHover aria-label="Chat actions">
                                <MoreHorizontal />
                              </SidebarMenuAction>
                            }
                          />
                          <DropdownMenuContent align="start" side="right">
                            <DropdownMenuItem onClick={() => startRename(session.id, session.title)}>
                              <Pencil />
                              Rename
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => void setPinned(session.id, !session.pinned)}>
                              {session.pinned ? <PinOff /> : <Pin />}
                              {session.pinned ? "Unpin" : "Pin"}
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => void duplicate(session.id)}>
                              <Copy />
                              Duplicate
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => void exportSession(session.id)}>
                              <Download />
                              Export Markdown
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem variant="destructive" onClick={() => void remove(session.id)}>
                              <Trash2 />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </>
                    )}
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </div>
          ))
        )}
      </SidebarGroupContent>
    </SidebarGroup>
  )
}
