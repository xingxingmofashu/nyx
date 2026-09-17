import { existsSync, readdirSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import { pipeline, type DataType } from "@huggingface/transformers";
import { Global } from "@nyx/global";
import { configureEnv } from "./runtime.ts";
import type { ProgressInfo } from "./runtime.ts";
import { createOverallProgress, fetchRepoTree, planPull } from "./pull-progress.ts";
import type { LLMTask } from "./types.ts";

export class PullAbortedError extends Error {
  constructor(modelId: string) {
    super(`Pull cancelled: ${modelId}`);
    this.name = "PullAbortedError";
  }
}

export interface CachedModel {
  id: string;
  name: string;
  task: LLMTask;
  dtype?: DataType;
  createdAt: string;
  [key: string]: unknown;
}

function asCached(info: Global.ModelInfo): CachedModel {
  return info as CachedModel;
}

function throwIfAborted(modelId: string, signal?: AbortSignal): void {
  if (signal?.aborted) throw new PullAbortedError(modelId);
}

export async function listModels(): Promise<CachedModel[]> {
  const modelsDir = Global.Path.models;
  const config = await Global.Models.read();
  const installed: CachedModel[] = [];

  for (const [org, { models }] of Object.entries(config.provider)) {
    for (const [name, info] of Object.entries(models)) {
      if (existsSync(join(modelsDir, org, name))) installed.push(asCached(info));
    }
  }

  return installed.sort((a, b) => a.id.localeCompare(b.id));
}

export async function pullModel(
  modelId: string,
  task: LLMTask,
  onProgress?: (info: ProgressInfo) => void,
  dtype?: DataType,
  signal?: AbortSignal,
): Promise<void> {
  const [org, ...rest] = modelId.split("/");
  const name = rest.join("/");
  if (!org || !name) {
    throw new Error(`Invalid model id: ${modelId}`);
  }

  await configureEnv();
  const tree = await fetchRepoTree(modelId);
  await prune(modelId, tree);

  const plan = onProgress ? planPull(tree) : null;
  const overall = plan ? createOverallProgress(plan) : null;

  const progress_callback: ((info: ProgressInfo) => void) | undefined =
    signal || onProgress
      ? (info) => {
          throwIfAborted(modelId, signal);
          onProgress?.(overall ? overall(info) : info);
        }
      : undefined;

  await pipeline(task, modelId, {
    ...(dtype ? { dtype } : {}),
    ...(progress_callback ? { progress_callback } : {}),
  });

  throwIfAborted(modelId, signal);

  const info: Global.ModelInfo = {
    id: modelId,
    name,
    task,
    ...(dtype ? { dtype } : {}),
    createdAt: new Date().toISOString(),
  };
  await Global.Models.register({ provider: { [org]: { models: { [name]: info } } } });
}

export async function findModel(modelId: string): Promise<CachedModel | undefined> {
  const config = await Global.Models.read();
  for (const { models } of Object.values(config.provider)) {
    for (const info of Object.values(models)) {
      if (info.id === modelId) return asCached(info);
    }
  }
  return undefined;
}

export async function removeModel(modelId: string): Promise<boolean> {
  const [org, ...rest] = modelId.split("/");
  const name = rest.join("/");
  if (!org || !name) return false;
  const dir = join(Global.Path.models, org, name);
  if (!existsSync(dir)) return false;
  rmSync(dir, { recursive: true, force: true });
  const orgDir = join(Global.Path.models, org);
  if (existsSync(orgDir) && readdirSafe(orgDir).length === 0) {
    rmSync(orgDir, { recursive: true, force: true });
  }
  await Global.Models.unregister(modelId);
  return true;
}

function prune(modelId: string, tree: Map<string, number> | null): void {
  const [org, ...rest] = modelId.split("/");
  const name = rest.join("/");
  if (!org || !name) return;

  const weightsDir = join(Global.Path.models, org, name, "onnx");
  if (!existsSync(weightsDir) || !tree) return;

  const remote = new Map<string, number>();
  for (const [path, size] of tree) {
    if (path.startsWith("onnx/")) remote.set(path, size);
  }

  for (const local of readdirSync(weightsDir)) {
    if (remote.get(`onnx/${local}`) !== statSyncSafe(join(weightsDir, local))) {
      rmSync(join(weightsDir, local), { force: true });
    }
  }
}

function statSyncSafe(path: string): number | undefined {
  try {
    return statSync(path).size;
  } catch {
    return undefined;
  }
}

function readdirSafe(dir: string): string[] {
  try {
    return readdirSync(dir);
  } catch {
    return [];
  }
}
