import { t as tr } from "./i18n";
import { parseWorkflow } from "./workflow";
import type { Workflow } from "./api";

export type SavedWorkflow = {
  id: string;
  name: string;
  at: number;
  nodes: number;
  graph: Workflow;
};

const KEY = "workflow-library-v1";
const LIMIT = 60;

function isEntry(value: unknown): value is SavedWorkflow {
  if (!value || typeof value !== "object") return false;
  const entry = value as Record<string, unknown>;
  return (
    typeof entry.id === "string" &&
    entry.id.length > 0 &&
    entry.id.length <= 100 &&
    typeof entry.name === "string" &&
    entry.name.length > 0 &&
    entry.name.length <= 120 &&
    typeof entry.at === "number" &&
    Boolean(entry.graph) &&
    typeof entry.graph === "object"
  );
}

export function readWorkflows(): SavedWorkflow[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    if (!Array.isArray(raw)) return [];
    return raw.filter(isEntry).slice(0, LIMIT);
  } catch {
    return [];
  }
}

function persist(list: SavedWorkflow[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
    return true;
  } catch {
    return false;
  }
}

export function saveWorkflow(
  name: string,
  graph: Workflow,
  id?: string,
): SavedWorkflow[] {
  const clean = name.trim().slice(0, 120) || tr("Workflow sans titre");
  const list = readWorkflows();
  const entry: SavedWorkflow = {
    id: id ?? crypto.randomUUID(),
    name: clean,
    at: Date.now(),
    nodes: Object.keys(graph).length,
    graph,
  };
  const next = [entry, ...list.filter((item) => item.id !== entry.id)].slice(
    0,
    LIMIT,
  );
  if (!persist(next)) throw Error(tr("Impossible d’enregistrer ce workflow sur l’appareil."));
  return next;
}

export function deleteWorkflow(id: string): SavedWorkflow[] {
  const next = readWorkflows().filter((item) => item.id !== id);
  persist(next);
  return next;
}

/** Re-validate a stored graph before handing it to the editor. */
export function openWorkflow(entry: SavedWorkflow): Workflow {
  return parseWorkflow(JSON.stringify(entry.graph));
}

export function downloadWorkflow(name: string, graph: Workflow) {
  const text = JSON.stringify({ prompt: graph }, null, 2);
  const blob = new Blob([text], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  const safe = name.trim().replace(/[\\/:*?"<>|]+/g, "-") || "workflow";
  anchor.href = url;
  anchor.download = `${safe}.json`;
  anchor.rel = "noopener";
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
