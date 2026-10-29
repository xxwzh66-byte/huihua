import { t as tr } from "./i18n";
import { invoke, isTauri } from "@tauri-apps/api/core";

export interface NodeDef {
  class_type: string;
  inputs: Record<string, unknown>;
  _meta?: { title: string };
}
export type Workflow = Record<string, NodeDef>;
export interface ImageRef {
  filename: string;
  subfolder: string;
  type: string;
}
/**
 * v1.0 gallery items are read straight from the ComfyUI history, so the only
 * identity an image has is its filename inside the server's output folder.
 */
export interface GalleryItem {
  favorite?: boolean;
  root: number;
  relative: string;
  name: string;
  folder: string;
  size: number;
  modified: number;
}
export interface Gallery {
  items: GalleryItem[];
  total: number;
  warnings: string[];
}
export interface NodeInfo {
  input: {
    required: Record<string, unknown[]>;
    optional?: Record<string, unknown[]>;
  };
}
export type ObjectInfo = Record<string, NodeInfo>;
export interface HistoryEntry {
  outputs: Record<string, { images?: ImageRef[] }>;
  status?: {
    status_str: string;
    completed: boolean;
    messages?: [string, Record<string, unknown>][];
  };
  prompt?: unknown[];
}
export type History = Record<string, HistoryEntry>;
export interface Queue {
  queue_running: [number, string, ...unknown[]][];
  queue_pending: [number, string, ...unknown[]][];
}
export interface Stats {
  system?: { ram_total?: number; ram_free?: number };
  devices: { name: string; vram_total: number; vram_free: number }[];
}
export interface Event {
  seq: number;
  type: string;
  data: Record<string, unknown> | string;
}
export async function native<T>(
  command: string,
  args: Record<string, unknown> = {},
): Promise<T> {
  if (isTauri()) return invoke<T>(command, args);
  // Development/test adapter is only served by the explicitly enabled local test harness.
  const r = await fetch("/__native", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ command, args }),
  });
  if (!r.ok) throw new Error(tr("Ouvrez l’application 绘画 pour joindre votre serveur."));
  const data = await r.json();
  if (data.error) throw new Error(data.error);
  return data.value;
}
export const api = <T>(path: string, body?: unknown) =>
  native<T>("api", { path, body: body ?? null });
export const imageUrl = (path: string) => native<string>("image", { path });
export function imagePath(i: ImageRef) {
  return (
    "/api/view?" +
    new URLSearchParams({
      filename: i.filename,
      subfolder: i.subfolder ?? "",
      type: i.type ?? "output",
    })
  );
}
export function galleryPath(i: GalleryItem) {
  return imagePath({
    filename: i.name,
    subfolder: i.folder,
    type: "output",
  });
}
/** Turn one history entry into gallery items, newest image first. */
export function historyImages(entries: History): GalleryItem[] {
  const seen = new Set<string>();
  const items: GalleryItem[] = [];
  for (const entry of Object.values(entries)) {
    for (const output of Object.values(entry?.outputs ?? {})) {
      for (const image of output?.images ?? []) {
        if (image.type !== "output") continue;
        const folder = image.subfolder ?? "";
        const relative = folder ? `${folder}/${image.filename}` : image.filename;
        if (seen.has(relative)) continue;
        seen.add(relative);
        items.push({
          root: 0,
          relative,
          name: image.filename,
          folder,
          size: 0,
          modified: 0,
        });
      }
    }
  }
  return items;
}
/**
 * ComfyUI writes a dropdown (COMBO) definition in more than one shape:
 * `["COMBO", { options: [...] }]` on recent builds, `[[...values], {...}]` on
 * older ones, and `["COMBO", { options: [...] }, {...}]` when it carries extra
 * metadata. Read all of them, because a missed shape means an empty candidate
 * list — and an empty list is exactly how an impossible value slips through.
 */
export function optionList(definition: unknown): string[] {
  if (!Array.isArray(definition)) return [];
  const [kind, meta] = definition as [unknown, unknown];
  const metaOptions = (meta as { options?: unknown } | undefined)?.options;
  const fromMeta = (metaOptions as { options?: unknown } | undefined)?.options ?? metaOptions;
  const raw =
    kind === "COMBO" || !Array.isArray(kind)
      ? fromMeta
      : (kind as unknown[]).length
        ? kind
        : fromMeta;
  return Array.isArray(raw)
    ? raw.filter((v): v is string => typeof v === "string")
    : [];
}

export function choices(
  info: ObjectInfo,
  node: string,
  field: string,
): string[] {
  const definition = info[node]?.input?.required?.[field] ?? info[node]?.input?.optional?.[field];
  return optionList(definition);
}

export function modelChoices(info: ObjectInfo): string[] {
  return [...new Set([...choices(info, "CheckpointLoaderSimple", "ckpt_name"), ...choices(info, "UNETLoader", "unet_name")])];
}
