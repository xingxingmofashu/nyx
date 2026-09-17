import { ChevronRightIcon, FileIcon, FolderIcon, FolderOpenIcon, Trash2 } from "lucide-react"
import { cn } from "#lib/utils.ts"
import type { KnowledgeDocument, KnowledgeDocumentStatus } from "../../../../shared/types"
import { buildTree, countDocuments, type TreeFolder } from "./tree"
import { Button } from "../ui/button"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "../ui/collapsible"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "../ui/context-menu"

/** The status dot's tooltip, i.e. what the index says about one document. */
const STATUS_LABEL: Record<KnowledgeDocumentStatus, string> = {
  indexed: "Indexed",
  stale: "Changed since the last index — run Update index",
  new: "Not indexed yet",
}

/** Tooltip and colour of the dot: green indexed, amber embedding, grey pending. */
function statusDot(status: KnowledgeDocumentStatus, processing: boolean): { label: string; className: string } {
  if (processing) return { label: "Embedding this document…", className: "bg-amber-500 animate-pulse" }
  if (status === "indexed") return { label: STATUS_LABEL.indexed, className: "bg-emerald-500" }
  return { label: STATUS_LABEL[status], className: "bg-muted-foreground/40" }
}

interface KnowledgeTreeProps {
  documents: KnowledgeDocument[]
  selected: string | null
  /** Path filter; while set, matching folders are forced open. */
  filter: string
  /** Folders the user collapsed, by path. */
  collapsed: Record<string, boolean>
  /** Path of the document being embedded right now, if a run is in flight. */
  processing: string | null
  onSelect: (path: string) => void
  onDelete: (path: string) => void
  onToggleFolder: (path: string) => void
}

/**
 * The knowledge documents as a file tree: nested collapsibles built from the
 * flat document paths (shadcn's Collapsible "File Tree"). Clicking a document
 * previews it; right-clicking one offers Delete. The trailing dot is the index
 * status: green when it is in the vector store, grey while it still has to be
 * built, amber while it is being embedded.
 */
export function KnowledgeTree({
  documents,
  selected,
  filter,
  collapsed,
  processing,
  onSelect,
  onDelete,
  onToggleFolder,
}: KnowledgeTreeProps) {
  const needle = filter.trim().toLowerCase()
  const visible = needle === "" ? documents : documents.filter((doc) => doc.file.toLowerCase().includes(needle))
  const tree = buildTree(visible)
  const expanded = filter !== ""

  return (
    <div className="flex flex-col gap-0.5">
      {tree.folders.map((folder) => (
        <FolderRow
          key={folder.path}
          folder={folder}
          selected={selected}
          collapsed={collapsed}
          forceOpen={expanded}
          processing={processing}
          onSelect={onSelect}
          onDelete={onDelete}
          onToggleFolder={onToggleFolder}
        />
      ))}
      {tree.files.map((doc) => (
        <DocumentRow
          key={doc.file}
          doc={doc}
          selected={selected}
          processing={processing}
          onSelect={onSelect}
          onDelete={onDelete}
        />
      ))}
    </div>
  )
}

function FolderRow({
  folder,
  selected,
  collapsed,
  forceOpen,
  processing,
  onSelect,
  onDelete,
  onToggleFolder,
}: {
  folder: TreeFolder
  selected: string | null
  collapsed: Record<string, boolean>
  forceOpen: boolean
  processing: string | null
  onSelect: (path: string) => void
  onDelete: (path: string) => void
  onToggleFolder: (path: string) => void
}) {
  const open = forceOpen || collapsed[folder.path] !== true
  return (
    <Collapsible
      open={open}
      onOpenChange={() => {
        // While filtering the tree stays open; only the user's own state counts.
        if (!forceOpen) onToggleFolder(folder.path)
      }}
    >
      <CollapsibleTrigger
        render={
          <Button variant="ghost" size="sm" className="group w-full justify-start gap-2 transition-none">
            <ChevronRightIcon className="transition-transform group-data-[panel-open]:rotate-90" />
            <FolderIcon className="group-data-[panel-open]:hidden" />
            <FolderOpenIcon className="hidden group-data-[panel-open]:block" />
            <span className="truncate">{folder.name}</span>
            <span className="ms-auto text-xs text-muted-foreground tabular-nums">{countDocuments(folder)}</span>
          </Button>
        }
      />
      <CollapsibleContent>
        <div className="flex flex-col gap-0.5 pt-0.5 ps-4">
          {folder.folders.map((child) => (
            <FolderRow
              key={child.path}
              folder={child}
              selected={selected}
              collapsed={collapsed}
              forceOpen={forceOpen}
              processing={processing}
              onSelect={onSelect}
              onDelete={onDelete}
              onToggleFolder={onToggleFolder}
            />
          ))}
          {folder.files.map((doc) => (
            <DocumentRow
          key={doc.file}
          doc={doc}
          selected={selected}
          processing={processing}
          onSelect={onSelect}
          onDelete={onDelete}
        />
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}

function DocumentRow({
  doc,
  selected,
  processing,
  onSelect,
  onDelete,
}: {
  doc: KnowledgeDocument
  selected: string | null
  processing: string | null
  onSelect: (path: string) => void
  onDelete: (path: string) => void
}) {
  const name = doc.file.slice(doc.file.lastIndexOf("/") + 1)
  const dot = statusDot(doc.status, processing === doc.file)
  return (
    <ContextMenu>
      <ContextMenuTrigger render={<div className="flex items-center" />}>
        <Button
          variant="ghost"
          size="sm"
          className={cn("min-w-0 flex-1 justify-start gap-2", selected === doc.file && "bg-accent")}
          title={doc.file}
          onClick={() => onSelect(doc.file)}
        >
          <FileIcon />
          <span className="truncate">{name}</span>
          <span
            role="img"
            aria-label={dot.label}
            title={dot.label}
            className={cn("ms-auto size-1.5 shrink-0 rounded-full", dot.className)}
          />
        </Button>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem variant="destructive" onClick={() => onDelete(doc.file)}>
          <Trash2 />
          Delete {name}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}
