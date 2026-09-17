import { env, type ProgressInfo } from "@huggingface/transformers"

/**
 * Overall download progress for a pull.
 *
 * transformers.js only reports progress one file at a time — every event
 * carries a single `file` and `loaded`/`total` are that file's bytes — so the
 * pull's own total has to come from somewhere else: the repo listing. This
 * module reads that listing, works out which files a pull will fetch, and folds
 * the per-file events into one running percentage. Events keep their `file` (so
 * the UI can still show what is downloading) while `loaded`/`total`/`progress`
 * describe the whole pull.
 */

/** Remote files in a repo (path → size in bytes), or null when the hub can't be read. */
export async function fetchRepoTree(modelId: string): Promise<Map<string, number> | null> {
  const host = env.remoteHost.replace(/\/$/, "")
  try {
    const res = await fetch(`${host}/api/models/${modelId}/tree/main?recursive=true`)
    if (!res.ok) return null
    const entries = (await res.json()) as Array<{ path?: unknown; type?: unknown; size?: unknown }>
    if (!Array.isArray(entries)) return null

    const files = new Map<string, number>()
    for (const entry of entries) {
      if (entry.type === "file" && typeof entry.path === "string" && typeof entry.size === "number") {
        files.set(entry.path, entry.size)
      }
    }
    return files.size > 0 ? files : null
  } catch {
    // Offline, gated, or a hub hiccup: callers degrade instead of failing.
    return null
  }
}

/** What one pull is expected to download. */
export interface PullPlan {
  /** The files counted in `total`, with their remote sizes. */
  files: Map<string, number>
  /** The ONNX file the runtime is expected to load ('' when it can't be predicted). */
  weight: string
  /** Sum of `files`; the denominator of the overall percentage. */
  total: number
  /** The full repo listing, for sizing files that show up unplanned. */
  tree: Map<string, number>
}

/**
 * Turn a repo listing into a download plan.
 *
 * Only two kinds of file are counted: the repo root (the config/tokenizer/
 * processor the loader reads before the weights) and the ONNX weights. Anything
 * else in a subdirectory — a `voices/` or `samples/` folder, a README — is never
 * fetched by a pipeline, so counting it would inflate the total.
 */
export function planPull(tree: Map<string, number> | null): PullPlan | null {
  if (!tree) return null

  const weight = pickWeightFile(tree)
  const files = new Map<string, number>()
  for (const [path, size] of tree) {
    if (!path.includes("/") && !path.startsWith(".") && !path.toLowerCase().endsWith(".md")) {
      files.set(path, size)
    }
  }
  if (weight) {
    // Models split across several files (`encoder_model.onnx`,
    // `decoder_model_merged.onnx`, …) also keep external data next to them.
    for (const [path, size] of tree) {
      if (path === weight || path.startsWith(`${weight}_data`)) files.set(path, size)
    }
  }

  let total = 0
  for (const size of files.values()) total += size
  return total > 0 ? { files, weight, total, tree } : null
}

/**
 * The weights file a pull will load. Pulls leave the dtype to transformers.js,
 * which defaults to fp32 (`model.onnx`) and falls back to `model_quantized.onnx`
 * for repos that only ship quantized weights; a repo with exactly one variant
 * obviously uses that one. Several variants and no default name (SpeechT5's
 * encoder/decoder layout) leaves it unknown — the announced files then define
 * the total instead (see `createOverallProgress`).
 */
function pickWeightFile(tree: Map<string, number>): string {
  const candidates = [...tree.keys()].filter((path) => /^onnx\/[^/]+\.onnx$/.test(path))
  for (const preferred of ["onnx/model.onnx", "onnx/model_quantized.onnx"]) {
    if (candidates.includes(preferred)) return preferred
  }
  return candidates.length === 1 ? (candidates[0] ?? "") : ""
}

/** Fold per-file progress events into overall progress across the pull. */
export function createOverallProgress(plan: PullPlan): (info: ProgressInfo) => ProgressInfo {
  let total = plan.total
  let predicted = plan.weight
  let completed = 0
  let loaded = 0
  const counted = new Set<string>(plan.files.keys())
  const finished = new Set<string>()

  const sizeOf = (file: string): number | undefined => plan.tree.get(file)

  return (info) => {
    if (info.status === "initiate" || info.status === "download") {
      if (info.file.endsWith(".onnx") && sizeOf(info.file) !== undefined) {
        // The runtime's real file set shows up here. If the first weight file
        // isn't the predicted one (another quantization, or an encoder/decoder
        // split), drop the guess before counting what is actually fetched.
        if (predicted) {
          if (info.file !== predicted) total -= sizeOf(predicted) ?? 0
          predicted = ""
        }
        if (!counted.has(info.file)) {
          counted.add(info.file)
          total += sizeOf(info.file) ?? 0
        }
      }
      return info
    }

    if (info.status === "progress") {
      loaded = info.loaded
      const overall = Math.min(completed + loaded, total)
      return { ...info, loaded: overall, total, progress: total > 0 ? (overall / total) * 100 : 0 }
    }

    if (info.status === "done" && !finished.has(info.file)) {
      finished.add(info.file)
      completed += sizeOf(info.file) ?? loaded
      loaded = 0
    }
    return info
  }
}
