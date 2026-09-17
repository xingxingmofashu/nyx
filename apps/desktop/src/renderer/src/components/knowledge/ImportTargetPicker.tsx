import { ChevronDownIcon, FolderIcon, FolderInputIcon } from "lucide-react"
import type { KnowledgeDocument } from "../../../../shared/types"
import { buildTree, type TreeFolder } from "./tree"
import { Button } from "../ui/button"
import { Input } from "../ui/input"
import { Popover, PopoverContent, PopoverDescription, PopoverHeader, PopoverTitle, PopoverTrigger } from "../ui/popover"
import { cn } from "#lib/utils.ts"

interface ImportTargetPickerProps {
  /** Target folder inside the knowledge dir; "" means its root. */
  value: string
  /** Documents whose folders the target can be picked from. */
  documents: KnowledgeDocument[]
  onChange: (value: string) => void
}

/**
 * Where imports land: a folder inside the knowledge dir, picked from a tree of
 * the ones that already exist or typed (and created on import). The label
 * always shows the current target, so a forgotten choice cannot send files
 * somewhere unseen.
 */
export function ImportTargetPicker({ value, documents, onChange }: ImportTargetPickerProps) {
  return (
    <Popover>
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
          <PopoverDescription>A folder inside the knowledge dir; created when it is missing.</PopoverDescription>
        </PopoverHeader>
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="root"
          aria-label="Import target folder"
          className="font-mono text-xs"
        />
        <div className="flex max-h-56 flex-col gap-0.5 overflow-y-auto">
          <TargetRow label="root" selected={value === ""} onSelect={() => onChange("")} />
          <FolderRows folders={buildTree(documents).folders} value={value} onSelect={onChange} />
        </div>
      </PopoverContent>
    </Popover>
  )
}

/** The folder tree, one indent level per nesting depth. */
function FolderRows({
  folders,
  value,
  onSelect,
}: {
  folders: TreeFolder[]
  value: string
  onSelect: (value: string) => void
}) {
  return folders.map((folder) => (
    <div key={folder.path} className="flex flex-col gap-0.5">
      <TargetRow label={folder.name} selected={value === folder.path} onSelect={() => onSelect(folder.path)} />
      {folder.folders.length > 0 && (
        <div className="flex flex-col gap-0.5 ps-4">
          <FolderRows folders={folder.folders} value={value} onSelect={onSelect} />
        </div>
      )}
    </div>
  ))
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
