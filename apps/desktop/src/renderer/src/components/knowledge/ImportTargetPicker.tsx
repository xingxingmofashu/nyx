import { useState } from "react"
import { ChevronDownIcon, FolderIcon, FolderInputIcon } from "lucide-react"
import type { KnowledgeDocument } from "../../types"
import { buildTree, type TreeFolder } from "./tree"
import { Button } from "../ui/button"
import { Input } from "../ui/input"
import { Popover, PopoverContent, PopoverDescription, PopoverHeader, PopoverTitle, PopoverTrigger } from "../ui/popover"
import { cn } from "#lib/utils.ts"

interface ImportTargetPickerProps {
  
  value: string
  
  documents: KnowledgeDocument[]
  onChange: (value: string) => void
}

export function ImportTargetPicker({ value, documents, onChange }: ImportTargetPickerProps) {
  const [open, setOpen] = useState(false)
  const [filter, setFilter] = useState("")
  const needle = filter.trim().toLowerCase()
  const folders = buildTree(documents).folders
  const visible = needle === "" ? folders : filterFolders(folders, needle)

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        
        if (next) setFilter("")
      }}
    >
      <PopoverTrigger
        render={
          <Button
            variant="outline"
            title={`Import into ${value === "" ? "the knowledge root" : value}`}
            aria-label="Import target folder"
          >
            <FolderInputIcon data-icon="inline-start" />
            <span className="max-w-40 truncate font-mono text-xs">{value === "" ? "root" : value}</span>
            <ChevronDownIcon data-icon="inline-end" className="text-muted-foreground" />
          </Button>
        }
      />
      <PopoverContent align="start" className="w-72">
        <PopoverHeader>
          <PopoverTitle>Import into</PopoverTitle>
          <PopoverDescription>Documents are copied into the folder you pick.</PopoverDescription>
        </PopoverHeader>
        <Input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Search folders"
          aria-label="Search folders"
        />
        <div className="flex max-h-64 flex-col gap-0.5 overflow-y-auto">
          <TargetRow label="root" selected={value === ""} onSelect={() => onChange("")} />
          <div className="flex flex-col gap-0.5 ps-4">
            {visible.map((folder) => (
              <FolderNode key={folder.path} folder={folder} value={value} onSelect={onChange} />
            ))}
            {needle !== "" && visible.length === 0 && (
              <p className="px-2 py-1 text-xs text-muted-foreground">No folders match.</p>
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}

function FolderNode({
  folder,
  value,
  onSelect,
}: {
  folder: TreeFolder
  value: string
  onSelect: (value: string) => void
}) {
  return (
    <>
      <TargetRow label={folder.name} selected={value === folder.path} onSelect={() => onSelect(folder.path)} />
      {folder.folders.length > 0 && (
        <div className="flex flex-col gap-0.5 ps-4">
          {folder.folders.map((child) => (
            <FolderNode key={child.path} folder={child} value={value} onSelect={onSelect} />
          ))}
        </div>
      )}
    </>
  )
}

function TargetRow({
  label,
  selected,
  onSelect,
}: {
  label: string
  selected: boolean
  onSelect: () => void
}) {
  return (
    <Button
      variant={selected ? "secondary" : "ghost"}
      size="sm"
      className={cn("w-full justify-start gap-2", selected && "font-medium")}
      onClick={onSelect}
    >
      <FolderIcon />
      <span className="truncate font-mono text-xs">{label}</span>
    </Button>
  )
}

function filterFolders(folders: TreeFolder[], needle: string): TreeFolder[] {
  return folders.flatMap((folder) => {
    const children = filterFolders(folder.folders, needle)
    if (children.length > 0) return [{ ...folder, folders: children }]
    return folder.path.toLowerCase().includes(needle) ? [folder] : []
  })
}
