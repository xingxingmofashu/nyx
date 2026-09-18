import { useCallback, useEffect, useRef, useState } from "react"
import { ImageIcon, Sparkles, Upload, X } from "lucide-react"
import { useModelsStore } from "../store/models"
import type { ImageResult } from "../types"
import { ModelPicker } from "../components/ModelPicker"
import { Button } from "../components/ui/button"
import { Spinner } from "../components/ui/spinner"
import { cn } from "../lib/utils"

function toObjectUrl(result: ImageResult): string {
  const buf = result.data.buffer.slice(result.data.byteOffset, result.data.byteOffset + result.data.byteLength) as ArrayBuffer
  return URL.createObjectURL(new Blob([buf], { type: result.mimeType }))
}

interface SourceImage {
  file: File
  url: string
}

export function ImageToImagePage() {
  const selectedModel = useModelsStore((s) => s.selected["image-to-image"])
  const [source, setSource] = useState<SourceImage | null>(null)
  const [result, setResult] = useState<{ url: string; width: number; height: number } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const resultUrlRef = useRef<string | null>(null)

  useEffect(() => {
    return () => {
      if (resultUrlRef.current) URL.revokeObjectURL(resultUrlRef.current)
    }
  }, [])

  const onFile = useCallback((file: File) => {
    if (!file.type.startsWith("image/")) return
    setSource({ file, url: URL.createObjectURL(file) })
    setResult(null)
    setError(null)
  }, [])

  const clearSource = () => {
    if (source) URL.revokeObjectURL(source.url)
    setSource(null)
    setResult(null)
  }

  const run = async () => {
    if (!source || !selectedModel || busy) return
    setBusy(true)
    setError(null)
    try {
      const data = new Uint8Array(await source.file.arrayBuffer())
      const output = await window.nyx.tasks.imageToImage.run(selectedModel, { data, mimeType: source.file.type || "image/png" })
      if (resultUrlRef.current) URL.revokeObjectURL(resultUrlRef.current)
      const url = toObjectUrl(output)
      resultUrlRef.current = url
      setResult({ url, width: output.width, height: output.height })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <div className="flex flex-1 flex-col gap-4 p-4">
        {/* Drop zone / input */}
        <div
          onDragOver={(e) => {
            e.preventDefault()
            setDragOver(true)
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDragOver(false)
            const file = e.dataTransfer.files[0]
            if (file) void onFile(file)
          }}
          onClick={() => fileInputRef.current?.click()}
          className={cn(
            "flex h-40 cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed transition-colors",
            dragOver
              ? "border-ring bg-accent/40"
              : "border-border bg-card/40 hover:border-muted-foreground/50",
          )}
        >
          {source ? (
            <img src={source.url} alt="Source" className="max-h-32 max-w-full rounded-lg object-contain" />
          ) : (
            <>
              <Upload className="size-6 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Drop an image here or click to browse</p>
            </>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) void onFile(file)
              e.target.value = ""
            }}
          />
        </div>

        {source && (
          <Button variant="ghost" size="sm" className="self-center text-muted-foreground" onClick={clearSource}>
            Remove image
          </Button>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}

        {result ? (
          <div className="flex flex-1 flex-col items-center gap-2">
            <p className="text-xs text-muted-foreground">
              Result — {result.width}×{result.height}px
            </p>
            <img src={result.url} alt="Result" className="max-h-[50vh] rounded-lg object-contain" />
          </div>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 rounded-xl border bg-card/40">
            <ImageIcon className="size-5 text-muted-foreground/60" />
            <p className="text-xs text-muted-foreground/60">Result preview appears here</p>
          </div>
        )}
      </div>

      <div className="flex items-center gap-3 border-t bg-card px-4 py-3">
        <ModelPicker task="image-to-image" />
        <div className="ml-auto flex gap-2">
          <Button variant="secondary" onClick={clearSource} disabled={!source}>
            <X data-icon="inline-start" /> Clear
          </Button>
          <Button onClick={() => void run()} disabled={!source || !selectedModel || busy}>
            {busy ? (
              <>
                <Spinner data-icon="inline-start" /> Running…
              </>
            ) : (
              <>
                <Sparkles data-icon="inline-start" /> Run
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}
