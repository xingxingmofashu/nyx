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
  Search,
  Trash2,
} from "lucide-react"
import { baseName, relativeTime } from "../../lib/format"
import { useAgentStore } from "../../store/agent"
import { useSessionsStore } from "../../store/sessions"
import {
  SidebarGroup,
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

export function SessionNav() {
  const navigate = useNavigate()
  const workspaceDir = useAgentStore((s) => s.workspaceDir)
  const sessions = useSessionsStore((s) => s.sessions)
  const activeId = useSessionsStore((s) => s.activeId)
  const busy = useSessionsStore((s) => s.busy)
  const compacting = useSessionsStore((s) => s.compacting)
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

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return needle ? sessions.filter((s) => s.title.toLowerCase().includes(needle)) : sessions
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
    if (busy || compacting) return
    void open(id)
    navigate("/agent")
  }

  const confirmRemove = async (id: string, title: string) => {
    const ok = await window.nyx.dialog.confirm({
      message: `Delete “${title}”?`,
      detail: "This permanently removes the chat and its transcript.",
      confirmLabel: "Delete",
    })
    if (ok) await remove(id)
  }

  return (
    <SidebarGroup>
      <SidebarGroupLabel>Chats{workspaceDir ? ` · ${baseName(workspaceDir)}` : ""}</SidebarGroupLabel>
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

        {filtered.length === 0 ? (
          <p className="px-2 py-1 text-xs text-muted-foreground group-data-[collapsible=icon]:hidden">
            {query ? "No matching chats" : "No chats yet"}
          </p>
        ) : (
          <SidebarMenu>
            {filtered.map((session) => (
                  <SidebarMenuItem key={session.id}>
                    {renamingId === session.id ? (
                      <SidebarInput
                        ref={renameInput}
                        autoFocus
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onBlur={() => {
                          
                          
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
                          disabled={busy || compacting}
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
                            <DropdownMenuItem
                              variant="destructive"
                              onClick={() => void confirmRemove(session.id, session.title)}
                            >
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
        )}
      </SidebarGroupContent>
    </SidebarGroup>
  )
}
