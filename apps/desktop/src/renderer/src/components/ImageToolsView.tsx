import { useCallback, useEffect, useRef, useState } from "react"
import { ImageIcon, Sparkles, Upload, X } from "lucide-react"
import { useModelsStore } from "../store/models"
import type { ImageResult } from "../../../shared/types"

function toObjectUrl(result: ImageResult): string {
  const blob = new Blob([result.data.buffer.slice(result.data.byteOffset, result.data.byteOffset + result.data.byteLength) as ArrayBuffer], { type: result.mimeType })
  return URL.createObjectURL(blob)
}

interface SourceImage {
  file: File
  url: string
}

export function ImageToolsView() {
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
      const output = await window.nyx.image.run({ data, mimeType: source.file.type || "image/png" }, selectedModel)
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
          className={`flex h-40 cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed transition-colors ${
            dragOver ? "border-emerald-500 bg-emerald-500/10" : "border-zinc-700 bg-zinc-900/40 hover:border-zinc-500"
          }`}
        >
          {source ? (
            <img src={source.url} alt="Source" className="max-h-32 max-w-full rounded-lg object-contain" />
          ) : (
            <>
              <Upload size={24} className="text-zinc-500" />
              <p className="text-sm text-zinc-400">Drop an image here or click to browse</p>
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
          <button onClick={clearSource} className="self-center text-xs text-zinc-500 hover:text-zinc-300">
            Remove image
          </button>
        )}

        {/* Result area */}
        {error && <p className="text-sm text-red-400">{error}</p>}

        {result ? (
          <div className="flex flex-1 flex-col items-center gap-2">
            <p className="text-xs text-zinc-400">
              Result — {result.width}×{result.height}px
            </p>
            <img src={result.url} alt="Result" className="max-h-[50vh] rounded-lg object-contain" />
          </div>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900/20">
            <ImageIcon size={22} className="text-zinc-600" />
            <p className="text-xs text-zinc-600">Result preview appears here</p>
          </div>
        )}
      </div>

      <div className="flex items-center gap-3 border-t border-zinc-800 px-4 py-3">
        {!selectedModel ? (
          <p className="text-sm text-zinc-500">Select an image-to-image model in the sidebar.</p>
        ) : (
          <p className="min-w-0 truncate text-xs text-zinc-500">
            Model: <span className="text-zinc-300">{selectedModel}</span>
          </p>
        )}
        <div className="ml-auto flex gap-2">
          <button
            onClick={clearSource}
            disabled={!source}
            className="flex items-center gap-1.5 rounded-lg bg-zinc-800 px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-700 disabled:opacity-40"
          >
            <X size={14} /> Clear
          </button>
          <button
            onClick={() => void run()}
            disabled={!source || !selectedModel || busy}
            className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-40"
          >
            {busy ? (
              <>
                <span className="h-3 w-3 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                Running…
              </>
            ) : (
              <>
                <Sparkles size={14} /> Run
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
