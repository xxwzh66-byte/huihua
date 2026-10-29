import type { ObjectInfo, Workflow } from "./api";
import { optionList } from "./api";

/** A ComfyUI link is `[sourceNodeId, outputSlot]`. */
export type Link = [string, number];

export function isLink(value: unknown): value is Link {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    typeof value[0] === "string" &&
    typeof value[1] === "number"
  );
}

export type FieldKind =
  | "link"
  | "select"
  | "number"
  | "text"
  | "longtext"
  | "toggle"
  | "json";

export type Field = {
  name: string;
  kind: FieldKind;
  value: unknown;
  link?: Link;
  options?: string[];
  min?: number;
  max?: number;
  step?: number;
  required: boolean;
};

type Definition = [unknown, Record<string, unknown>?];

function definitionOf(
  info: ObjectInfo,
  classType: string,
  name: string,
): Definition | undefined {
  const input = info[classType]?.input;
  return (
    (input?.required?.[name] as Definition | undefined) ??
    (input?.optional?.[name] as Definition | undefined)
  );
}

function optionsOf(definition: Definition | undefined): string[] | undefined {
  if (!definition) return undefined;
  const options = optionList(definition);
  return options.length ? options : undefined;
}

/**
 * The single input name a node class exposes for a text prompt, if any. Used to
 * offer the rich prompt editor inside the visual workflow.
 */
export function isPromptField(classType: string, name: string) {
  return /clip(textencode|textencodeflux|textencodeqwenimage)/i.test(classType)
    ? name === "text"
    : name === "text" && /encode/i.test(classType);
}

export function nodeFields(
  graph: Workflow,
  info: ObjectInfo,
  id: string,
): Field[] {
  const node = graph[id];
  if (!node) return [];
  const fields: Field[] = [];
  for (const [name, value] of Object.entries(node.inputs ?? {})) {
    const definition = definitionOf(info, node.class_type, name);
    if (isLink(value)) {
      fields.push({ name, kind: "link", value, link: value, required: true });
      continue;
    }
    const required = Boolean(info[node.class_type]?.input?.required?.[name]);
    const options = optionsOf(definition);
    const meta = (definition?.[1] ?? {}) as {
      min?: number;
      max?: number;
      step?: number;
      multiline?: boolean;
    };
    const type = definition?.[0];
    if (options?.length) {
      fields.push({
        name,
        kind: "select",
        value,
        options,
        required,
      });
    } else if (typeof value === "boolean") {
      fields.push({ name, kind: "toggle", value, required });
    } else if (typeof value === "number" || type === "INT" || type === "FLOAT") {
      fields.push({
        name,
        kind: "number",
        value,
        min: typeof meta.min === "number" ? meta.min : undefined,
        max: typeof meta.max === "number" ? meta.max : undefined,
        step: typeof meta.step === "number" ? meta.step : type === "FLOAT" ? 0.01 : 1,
        required,
      });
    } else if (typeof value === "string") {
      fields.push({
        name,
        kind:
          meta.multiline || value.length > 60 || isPromptField(node.class_type, name)
            ? "longtext"
            : "text",
        value,
        required,
      });
    } else {
      fields.push({ name, kind: "json", value, required });
    }
  }
  return fields;
}

/** Immutable write of one widget value back into the graph. */
export function setField(
  graph: Workflow,
  id: string,
  name: string,
  value: unknown,
): Workflow {
  const node = graph[id];
  if (!node) return graph;
  return {
    ...graph,
    [id]: { ...node, inputs: { ...node.inputs, [name]: value } },
  };
}

/** Coerce a text/number input into the value ComfyUI expects. */
export function coerceField(field: Field, raw: string): unknown {
  if (field.kind === "number") {
    const value = Number(raw);
    if (!Number.isFinite(value)) return field.value;
    return field.step && field.step < 1 ? value : Math.round(value);
  }
  if (field.kind === "json") {
    try {
      return JSON.parse(raw) as unknown;
    } catch {
      return field.value;
    }
  }
  return raw;
}

export function nodeTitle(graph: Workflow, id: string): string {
  const node = graph[id];
  if (!node) return id;
  return node._meta?.title?.trim() || node.class_type;
}

export type Placed = {
  id: string;
  x: number;
  y: number;
  depth: number;
  row: number;
};

export type Edge = {
  from: string;
  to: string;
  slot: number;
  field: string;
};

export const CARD_WIDTH = 208;
export const CARD_GAP_X = 64;
export const CARD_GAP_Y = 20;

export type LayoutOptions = {
  width?: number;
  gapX?: number;
  gapY?: number;
  minHeight?: number;
  collapsedHeight?: number;
};

/**
 * Layered left-to-right layout: a node sits one column after its deepest
 * dependency. ComfyUI API graphs are small DAGs, so a memoised depth walk is
 * enough and cycles simply stop at the visited node.
 */
export function layoutGraph(
  graph: Workflow,
  heights: Record<string, number> = {},
  options: LayoutOptions = {},
): {
  nodes: Placed[];
  edges: Edge[];
  width: number;
  height: number;
  cardWidth: number;
} {
  const cardWidth = options.width ?? CARD_WIDTH;
  const gapX = options.gapX ?? CARD_GAP_X;
  const gapY = options.gapY ?? CARD_GAP_Y;
  const minHeight = options.minHeight ?? 150;
  const heightOf = (id: string) =>
    Math.max(options.collapsedHeight ?? 64, Math.round(heights[id] ?? minHeight));
  const ids = Object.keys(graph);
  const deps = new Map<string, string[]>();
  const edges: Edge[] = [];
  for (const id of ids) {
    const links: string[] = [];
    for (const [field, value] of Object.entries(graph[id].inputs ?? {})) {
      if (!isLink(value)) continue;
      const [from, slot] = value;
      if (!graph[from]) continue;
      links.push(from);
      edges.push({ from, to: id, slot, field });
    }
    deps.set(id, [...new Set(links)]);
  }
  const depth = new Map<string, number>();
  const walk = (id: string, stack: Set<string>): number => {
    const known = depth.get(id);
    if (known !== undefined) return known;
    if (stack.has(id)) return 0;
    stack.add(id);
    let value = 0;
    for (const parent of deps.get(id) ?? [])
      value = Math.max(value, walk(parent, stack) + 1);
    stack.delete(id);
    depth.set(id, value);
    return value;
  };
  for (const id of ids) walk(id, new Set());

  const columns = new Map<number, string[]>();
  for (const id of ids) {
    const column = depth.get(id) ?? 0;
    const list = columns.get(column) ?? [];
    list.push(id);
    columns.set(column, list);
  }
  const nodes: Placed[] = [];
  let tallest = 0;
  const ordered = [...columns.entries()].sort((a, b) => a[0] - b[0]);
  for (const [column, list] of ordered) {
    list.sort((a, b) => {
      const byTitle = nodeTitle(graph, a).localeCompare(nodeTitle(graph, b));
      return byTitle || a.localeCompare(b, "en", { numeric: true });
    });
    let y = 0;
    list.forEach((id, row) => {
      nodes.push({
        id,
        depth: column,
        row,
        x: column * (cardWidth + gapX),
        y,
      });
      y += heightOf(id) + gapY;
    });
    tallest = Math.max(tallest, y - gapY);
  }
  return {
    nodes,
    edges,
    width:
      ordered.length * cardWidth + Math.max(0, ordered.length - 1) * gapX,
    height: Math.max(150, tallest),
    cardWidth,
  };
}
