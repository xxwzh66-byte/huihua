import type { ObjectInfo, Workflow } from "./api";

/**
 * Node skipping, ported from st-chatu8.
 *
 * A node carrying `_skip: true` is stripped before the graph is sent to
 * ComfyUI. Consumers of that node are rewired to whatever fed it, so a chain
 * `A → B(_skip) → C` becomes `A → C`. When B has several inputs, the upstream
 * pick is scored by output type so an image never lands in a latent slot.
 */

type Link = [string, number];

const isLink = (value: unknown): value is Link =>
  Array.isArray(value) &&
  value.length === 2 &&
  typeof value[0] === "string" &&
  typeof value[1] === "number";

/** Which output types a node produces, per /object_info. */
function outputTypes(info: ObjectInfo, classType: string): string[] {
  const names = Array.isArray(info[classType]?.output) ? info[classType].output : [];
  return (names as unknown[]).filter(
    (name): name is string => typeof name === "string",
  );
}

/** What type of value an input expects, per /object_info. */
function inputType(
  info: ObjectInfo,
  classType: string,
  name: string,
): string | undefined {
  const node = info[classType] as
    | {
        input?: {
          required?: Record<string, unknown>;
          optional?: Record<string, unknown>;
        };
      }
    | undefined;
  const definition =
    node?.input?.required?.[name] ?? node?.input?.optional?.[name];
  if (!Array.isArray(definition)) return undefined;
  return typeof definition[0] === "string" ? definition[0] : undefined;
}

/** Follow `_skip` nodes upstream until a node that really runs is found. */
function resolveSource(
  workflow: Workflow,
  link: Link,
  name: string,
  info: ObjectInfo,
  guard = 0,
): Link | null {
  if (guard > 64) return null;
  const [id, slot] = link;
  const node = workflow[id];
  if (!node) return null;
  if (!node._skip) return [id, slot];
  const wanted = inputType(info, node.class_type, name);
  const upstream = Object.entries(node.inputs ?? {}).filter(
    (entry): entry is [string, Link] => isLink(entry[1]),
  );
  if (!upstream.length) return null;
  const scored = upstream
    .map(([, source]) => {
      const producer = workflow[source[0]];
      const types = producer ? outputTypes(info, producer.class_type) : [];
      const produced = types[source[1]];
      let score = 0;
      if (wanted && produced && produced === wanted) score = 3;
      else if (wanted && produced === "*") score = 2;
      else if (produced && produced === wanted) score = 1;
      return { source, score };
    })
    .sort((a, b) => b.score - a.score);
  return resolveSource(workflow, scored[0].source, name, info, guard + 1);
}

export interface SkipReport {
  graph: Workflow;
  removed: string[];
  rewired: number;
}

/** Strip `_skip` nodes and point their consumers at the real producers. */
export function applySkips(workflow: Workflow, info: ObjectInfo): SkipReport {
  const removed = Object.keys(workflow).filter((id) => workflow[id]?._skip);
  if (!removed.length) return { graph: workflow, removed, rewired: 0 };
  const dropped = new Set(removed);
  const out: Workflow = {};
  let rewired = 0;
  for (const [id, node] of Object.entries(workflow)) {
    if (dropped.has(id)) continue;
    const inputs: Record<string, unknown> = {};
    for (const [name, value] of Object.entries(node.inputs ?? {})) {
      if (isLink(value) && dropped.has(value[0])) {
        const source = resolveSource(workflow, value, name, info);
        if (!source) continue;
        inputs[name] = source;
        rewired += 1;
      } else {
        inputs[name] = value;
      }
    }
    out[id] = { ...node, inputs };
  }
  // Drop dangling links: a rewired source may itself have been removed.
  for (const node of Object.values(out)) {
    for (const [name, value] of Object.entries(node.inputs ?? {})) {
      if (isLink(value) && !out[value[0]]) delete node.inputs[name];
    }
  }
  return { graph: out, removed, rewired };
}

/**
 * Whether a node may be skipped: it must sit on a chain (one incoming link),
 * otherwise its consumers have nothing to reconnect to.
 */
export function skipStatus(
  workflow: Workflow,
  id: string,
  info: ObjectInfo,
): { canSkip: boolean; reason: string; typeMatch: boolean } {
  const node = workflow[id];
  if (!node) return { canSkip: false, reason: "", typeMatch: false };
  const incoming = Object.values(node.inputs ?? {}).filter(isLink);
  if (!incoming.length)
    return { canSkip: false, reason: "no upstream input", typeMatch: false };
  const consumers = Object.values(workflow).filter((other) =>
    Object.values(other.inputs ?? {}).some((value) => isLink(value) && value[0] === id),
  );
  if (!consumers.length)
    return { canSkip: true, reason: "leaf node", typeMatch: false };
  const types = outputTypes(info, node.class_type);
  return {
    canSkip: true,
    reason: types.length ? `produces ${types.join(" / ")}` : "chain node",
    typeMatch: types.length > 0,
  };
}

/** Every node id that ends up excluded from the submitted graph. */
export function skippedNodes(workflow: Workflow): string[] {
  return Object.keys(workflow).filter((id) => workflow[id]?._skip);
}

/** Count of nodes and links, for the canvas toolbar. */
export function graphStats(workflow: Workflow): { nodes: number; links: number } {
  let links = 0;
  for (const node of Object.values(workflow))
    for (const value of Object.values(node.inputs ?? {})) if (isLink(value)) links += 1;
  return { nodes: Object.keys(workflow).length, links };
}
