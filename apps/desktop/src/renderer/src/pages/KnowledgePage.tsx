import { useEffect, useMemo, useState } from "react"
import { FilePlus, FolderPlus, HardDrive, Library, RefreshCw, Search, Trash2 } from "lucide-react"
import { relativeTime } from "@nyx/shared"
import { useKnowledgeStore } from "../store/knowledge"
import type { KnowledgeDocument, KnowledgeImportResult } from "../../../shared/types"
import { normalizeImportTarget } from "../../../shared/knowledge"
import { ImportTargetPicker } from "../components/knowledge/ImportTargetPicker"
import { KnowledgeTree } from "../components/knowledge/KnowledgeTree"
import { MarkdownText } from "../components/chat/MarkdownText"
import { Badge } from "../components/ui/badge"
import { Button } from "../components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "../components/ui/empty"
import { Input } from "../components/ui/input"
import { Progress } from "../components/ui/progress"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select"
import { Separator } from "../components/ui/separator"
import { Spinner } from "../components/ui/spinner"
import { toast } from "../components/ui/toast"
import { formatBytes } from "../lib/format"
import { cn } from "../lib/utils"

/**
 * Manage the local knowledge base: browse documents as a file tree, preview the
 * Markdown, import files or a folder, delete documents, and build/rebuild the
 * vector index (with progress and a retrieval test).
 */
export function KnowledgePage() {
  const status = useKnowledgeStore((s) => s.status)
  const documents = useKnowledgeStore((s) => s.documents)
  const selected = useKnowledgeStore((s) => s.selected)
  const content = useKnowledgeStore((s) => s.content)
  const loading = useKnowledgeStore((s) => s.loading)
  const indexing = useKnowledgeStore((s) => s.indexing)
  const collapsed = useKnowledgeStore((s) => s.collapsed)
  const filter = useKnowledgeStore((s) => s.filter)
  const target = useKnowledgeStore((s) => s.target)
  const results = useKnowledgeStore((s) => s.results)
  const searchError = useKnowledgeStore((s) => s.searchError)
  const searching = useKnowledgeStore((s) => s.searching)
  const {
    load,
    select,
    toggleFolder,
    setFilter,
    setTarget,
    importFiles,
    importFolder,
    remove,
    setEmbeddingModel,
    updateIndex,
    cancelIndex,
    dismissNotice,
    search,
    clearResults,
  } = useKnowledgeStore()

  const [query, setQuery] = useState("")

  useEffect(() => {
    void load()
  }, [load])

  const busy = indexing !== null && !indexing.done
  const modelMissing = status !== null && !status.modelDownloaded
  const modelChanged =
    status !== null &&
    status.embeddingModel !== undefined &&
    status.indexedModel !== undefined &&
    status.indexedModel !== status.embeddingModel
  const current = documents.find((doc) => doc.file === selected)
  // A selected model that is not installed (or none at all) still has to show
  // in the picker, so the trigger never renders blank.
  const modelOptions = useMemo(() => {
    const installed = status?.availableEmbeddingModels ?? []
    const selectedModel = status?.embeddingModel
    return selectedModel !== undefined && !installed.includes(selectedModel)
      ? [selectedModel, ...installed]
      : installed
  }, [status])

  const runImport = async (pick: () => Promise<KnowledgeImportResult | null>) => {
    if (normalizeImportTarget(target) === null) {
      toast.add({
        title: "Invalid import folder",
        description: `“${target}” is not a relative folder name inside the knowledge dir.`,
        type: "error",
      })
      return
    }
    try {
      const result = await pick()
      if (result === null) return
      toast.add({ title: importSummary(result) })
    } catch (error) {
      toast.add({
        title: "Import failed",
        description: error instanceof Error ? error.message : String(error),
        type: "error",
      })
    }
  }

  const runDelete = async (path: string) => {
    try {
      if (await remove(path)) toast.add({ title: `Deleted ${path}` })
    } catch (error) {
      toast.add({
        title: "Delete failed",
        description: error instanceof Error ? error.message : String(error),
        type: "error",
      })
    }
  }

  const runRebuild = async () => {
    const confirmed = await window.nyx.dialog.confirm({
      message: "Rebuild the vector index?",
      detail:
        "The index is deleted and every document is embedded again with the current embedding model. Needed after changing the model; slower than Update index.",
      confirmLabel: "Rebuild",
    })
    if (confirmed) await updateIndex(true)
  }

  const runSearch = async () => {
    const trimmed = query.trim()
    if (trimmed !== "") await search(trimmed)
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-4 overflow-hidden p-4">
      <Card className="shrink-0">
        <CardHeader>
          <CardTitle>Knowledge base</CardTitle>
          <CardDescription>
            {status === null
              ? "Loading…"
              : `${status.documents} document${status.documents === 1 ? "" : "s"} · ${status.chunks} chunks · ${
                  status.updatedAt === undefined ? "never indexed" : `indexed ${relativeTime(status.updatedAt)}`
                } · ${status.embeddingModel ?? "no embedding model selected"}`}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <ImportTargetPicker value={target} documents={documents} onChange={setTarget} />
            <Button onClick={() => void runImport(importFolder)}>
              <FolderPlus data-icon="inline-start" />
              Import folder
            </Button>
            <Button variant="outline" onClick={() => void runImport(importFiles)}>
              <FilePlus data-icon="inline-start" />
              Import files
            </Button>
            <Separator orientation="vertical" className="mx-1 h-6" />
            <Button
              variant="outline"
              disabled={busy || modelMissing}
              title={modelMissing ? "Download the embedding model first" : "Embed changed documents"}
              onClick={() => void updateIndex(false)}
            >
              <RefreshCw data-icon="inline-start" />
              Update index
            </Button>
            <Button
              variant="outline"
              disabled={busy || modelMissing}
              title={modelMissing ? "Download the embedding model first" : "Drop the index and embed everything again"}
              onClick={() => void runRebuild()}
            >
              Rebuild
            </Button>
            {busy && (
              <>
                <Spinner className="text-muted-foreground" />
                <Button variant="ghost" size="sm" onClick={() => void cancelIndex()}>
                  Cancel
                </Button>
              </>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="shrink-0 text-xs text-muted-foreground">Embedding model</span>
            <Select value={status?.embeddingModel} onValueChange={(model) => model !== null && void setEmbeddingModel(model)}>
              <SelectTrigger size="sm" className="w-72" aria-label="Embedding model">
                <SelectValue placeholder="Select a local model" />
              </SelectTrigger>
              <SelectContent>
                {modelOptions.map((model) => (
                  <SelectItem key={model} value={model}>
                    {model}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {status !== null && modelOptions.length === 0 && (
              <span className="text-xs text-muted-foreground">
                No local embedding model installed — pull one from <span className="font-medium">Local models</span>{" "}
                with the <code className="font-mono text-xs">feature-extraction</code> task.
              </span>
            )}
          </div>
          {status !== null && (
            <p className="truncate font-mono text-xs text-muted-foreground" title={status.dir}>
              {status.dir}
            </p>
          )}
        </CardContent>
      </Card>

      {indexing !== null && (
        <Card className="shrink-0" size="sm">
          <CardContent className="flex flex-col gap-2">
            <div className="flex items-center gap-2 text-sm">
              {busy && <Spinner />}
              <span className="min-w-0 flex-1 truncate">
                {busy
                  ? `Embedding ${indexing.file ?? "documents"} (${indexing.filesDone}/${indexing.filesTotal})`
                  : indexing.error !== undefined
                    ? "Index build failed"
                    : indexing.cancelled === true
                      ? "Index build cancelled"
                      : `Index up to date — ${indexing.chunks} chunks`}
              </span>
              {!busy && (
                <Button variant="ghost" size="sm" onClick={dismissNotice}>
                  Dismiss
                </Button>
              )}
            </div>
            {busy && (
              <Progress
                value={
                  indexing.filesTotal === 0
                    ? null
                    : Math.round((indexing.filesDone / indexing.filesTotal) * 100)
                }
              />
            )}
            {indexing.error !== undefined && <p className="text-sm text-destructive">{indexing.error}</p>}
          </CardContent>
        </Card>
      )}

      {modelMissing && status !== null && (
        <p className="shrink-0 rounded-lg bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-300">
          {status.embeddingModel === undefined ? (
            <>
              No embedding model is selected, so indexing and search are unavailable. Pick a local model above, or
              pull one from <span className="font-medium">Local models</span> with the{" "}
              <code className="font-mono text-xs">feature-extraction</code> task.
            </>
          ) : (
            <>
              Embedding model “{status.embeddingModel}” is not downloaded, so indexing and search are unavailable.
              Download it from <span className="font-medium">Local models</span> with the{" "}
              <code className="font-mono text-xs">feature-extraction</code> task.
            </>
          )}
        </p>
      )}

      {modelChanged && status !== null && (
        <p className="shrink-0 rounded-lg bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-300">
          The index was built with “{status.indexedModel}”. Press <span className="font-medium">Rebuild</span> to
          replace it with “{status.embeddingModel}”.
        </p>
      )}

      <div className="flex min-h-0 min-w-0 flex-1 gap-4">
        <Card className="flex w-72 shrink-0 flex-col [--card-spacing:0px]">
          <div className="border-b p-2">
            <Input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter documents"
              aria-label="Filter documents"
            />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            {documents.length === 0 ? (
              <Empty className="border-0 p-4">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <Library />
                  </EmptyMedia>
                  <EmptyTitle>No documents</EmptyTitle>
                  <EmptyDescription>Import Markdown files to ground the agent in them.</EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              <KnowledgeTree
                documents={documents}
                selected={selected}
                filter={filter}
                collapsed={collapsed}
                processing={busy ? (indexing?.file ?? null) : null}
                onSelect={(path) => void select(path)}
                onDelete={(path) => void runDelete(path)}
                onToggleFolder={toggleFolder}
              />
            )}
          </div>
        </Card>

        <Card className="flex min-w-0 flex-1 flex-col [--card-spacing:0px]">
          <div className="flex min-w-0 items-center gap-2 border-b p-3">
            <span className="min-w-0 flex-1 truncate font-mono text-xs">{selected ?? "No document selected"}</span>
            {current !== undefined && (
              <>
                {current.status !== "indexed" && (
                  <Badge variant="outline" className="border-amber-500/40 text-amber-700 dark:text-amber-300">
                    {current.status === "stale" ? "Changed" : "Not indexed"}
                  </Badge>
                )}
                <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                  {formatBytes(current.size)} · {relativeTime(current.modifiedAt)}
                </span>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Delete ${current.file}`}
                  title="Delete document"
                  className="text-muted-foreground hover:text-destructive"
                  onClick={() => void runDelete(current.file)}
                >
                  <Trash2 />
                </Button>
              </>
            )}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            {content === null ? (
              <div className="flex h-full items-center justify-center">
                {loading ? (
                  <Spinner className="text-muted-foreground" />
                ) : (
                  <Empty className="border-0">
                    <EmptyHeader>
                      <EmptyMedia variant="icon">
                        <HardDrive />
                      </EmptyMedia>
                      <EmptyTitle>Nothing to preview</EmptyTitle>
                      <EmptyDescription>Pick a document in the tree to read it here.</EmptyDescription>
                    </EmptyHeader>
                  </Empty>
                )}
              </div>
            ) : (
              <MarkdownText mode="static" text={content} />
            )}
          </div>
        </Card>
      </div>

      <Card className="flex max-h-[45%] min-h-0 shrink-0 flex-col" size="sm">
        <CardContent className="flex min-h-0 flex-1 flex-col gap-3">
          <div className="flex shrink-0 items-center gap-2">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void runSearch()}
              placeholder="Try a retrieval query"
              aria-label="Retrieval query"
            />
            <Button
              variant="outline"
              disabled={searching || modelMissing || query.trim() === ""}
              onClick={() => void runSearch()}
            >
              {searching ? <Spinner data-icon="inline-start" /> : <Search data-icon="inline-start" />}
              Search
            </Button>
            {results !== null && (
              <Button variant="ghost" onClick={clearResults}>
                Clear
              </Button>
            )}
          </div>
          {searchError !== null && <p className="shrink-0 text-sm text-destructive">{searchError}</p>}
          {results !== null && (
            <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto">
              {results.length === 0 ? (
                <p className="text-sm text-muted-foreground">No passages matched.</p>
              ) : (
                results.map((hit, index) => (
                  <div key={`${hit.file}-${index}`} className="flex flex-col gap-1 rounded-lg bg-muted/40 p-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="min-w-0 flex-1 truncate font-mono text-xs">
                        {hit.heading ? `${hit.file} › ${hit.heading}` : hit.file}
                      </span>
                      <span className={cn("shrink-0 text-xs text-muted-foreground tabular-nums")}>
                        {hit.score.toFixed(4)}
                      </span>
                    </div>
                    <p className="line-clamp-4 text-xs text-muted-foreground">{hit.text}</p>
                  </div>
                ))
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

/** One-line summary of an import for the toast. */
function importSummary(result: KnowledgeImportResult): string {
  const total = result.written.length + result.overwritten.length + result.skipped.length
  if (total === 0) return "No Markdown files found"
  const parts = [`Imported ${result.written.length}`]
  if (result.overwritten.length > 0) parts.push(`overwrote ${result.overwritten.length}`)
  if (result.skipped.length > 0) parts.push(`skipped ${result.skipped.length}`)
  return parts.join(", ")
}
