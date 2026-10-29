import { isLink, type Field } from "./workflowGraph";
import type { Settings } from "./workflow";
import type { Workflow } from "./api";

/**
 * Placeholders let a hand-imported ComfyUI graph stay wired to the automatic
 * settings. A widget whose whole value is `{{steps}}` receives the numeric
 * value from the Atelier settings; a value that merely contains the token gets
 * a textual substitution.
 */
export type BindingKind = "text" | "number" | "select";

export type Binding = {
  key: string;
  label: string;
  kind: BindingKind;
  value: (settings: Settings) => string | number;
};

const text = (key: string, label: string, value: (s: Settings) => string): Binding => ({
  key,
  label,
  kind: "text",
  value,
});
const num = (key: string, label: string, value: (s: Settings) => number): Binding => ({
  key,
  label,
  kind: "number",
  value,
});

export const BINDINGS: Binding[] = [
  text("prompt", "正向提示词", (s) => s.positive),
  text("negative", "负向提示词", (s) => s.negative),
  text("model", "模型文件", (s) => s.model),
  text("vae", "VAE 文件", (s) => s.vae),
  num("steps", "步数", (s) => s.steps),
  num("cfg", "CFG", (s) => s.cfg),
  num("width", "宽度", (s) => s.width),
  num("height", "高度", (s) => s.height),
  num("seed", "随机种子", (s) => Number(s.seed.trim() || 0)),
  num("batch", "单批数量", (s) => s.batch),
  num("clip_skip", "CLIP 跳过层", (s) => s.clipSkip),
  text("sampler", "采样器", (s) => s.sampler),
  text("scheduler", "调度器", (s) => s.scheduler),
];

export const BINDING_KEYS = BINDINGS.map((b) => b.key);

export function bindingOf(key: string): Binding | undefined {
  return BINDINGS.find((b) => b.key === key);
}

export function token(key: string) {
  return `{{${key}}}`;
}

const WHOLE = /^\s*\{\{\s*([a-z_]+)\s*\}\}\s*$/;
const ANY = /\{\{\s*([a-z_]+)\s*\}\}/g;

/** Keys referenced anywhere in the graph, in stable order. */
export function usedBindings(graph: Workflow | null): string[] {
  const found = new Set<string>();
  if (!graph) return [];
  for (const node of Object.values(graph))
    for (const value of Object.values(node.inputs ?? {})) {
      if (typeof value !== "string") continue;
      if (WHOLE.test(value)) {
        const key = WHOLE.exec(value)?.[1];
        if (key) found.add(key);
        continue;
      }
      for (const match of value.matchAll(ANY)) found.add(match[1]);
    }
  return BINDING_KEYS.filter((key) => found.has(key));
}

export function isBindingValue(value: unknown): boolean {
  return typeof value === "string" && WHOLE.test(value);
}

/** Replace every placeholder with the current automatic setting. */
export function resolveGraph(graph: Workflow, settings: Settings): Workflow {
  const table = new Map(BINDINGS.map((b) => [b.key, b]));
  const out: Workflow = {};
  for (const [id, node] of Object.entries(graph)) {
    const inputs: Record<string, unknown> = {};
    for (const [name, value] of Object.entries(node.inputs ?? {})) {
      inputs[name] = resolveValue(value, table, settings);
    }
    out[id] = { ...node, inputs };
  }
  return out;
}

function resolveValue(
  value: unknown,
  table: Map<string, Binding>,
  settings: Settings,
): unknown {
  if (typeof value !== "string") return value;
  const whole = WHOLE.exec(value);
  if (whole) {
    const binding = table.get(whole[1]);
    return binding ? binding.value(settings) : value;
  }
  if (!value.includes("{{")) return value;
  return value.replace(ANY, (raw, key: string) => {
    const binding = table.get(key);
    return binding ? String(binding.value(settings)) : raw;
  });
}

/**
 * Wire a freshly imported graph to the automatic settings: prompts, sampler
 * values, latent size and the checkpoint name become placeholders so the
 * Atelier keeps driving the workflow.
 */
export function autoBind(graph: Workflow): { graph: Workflow; bound: string[] } {
  const bound: string[] = [];
  const set = (id: string, name: string, key: string) => {
    const node = graph[id];
    if (!node || !(name in (node.inputs ?? {}))) return;
    if (isLink(node.inputs[name])) return;
    graph[id] = {
      ...node,
      inputs: { ...node.inputs, [name]: token(key) },
    };
    bound.push(`${node.class_type}.${name} → ${token(key)}`);
  };

  // The sampler tells the two encoders apart: [nodeId, slot] feeds `positive`
  // and `negative`. Anything not referenced stays positive.
  const pos = new Set<string>();
  const neg = new Set<string>();
  for (const node of Object.values(graph)) {
    if (!/sampler/i.test(node.class_type)) continue;
    for (const [name, value] of Object.entries(node.inputs ?? {})) {
      if (name === "positive" && isLink(value)) pos.add(value[0]);
      if (name === "negative" && isLink(value)) neg.add(value[0]);
    }
  }
  const textNodes = Object.keys(graph).filter((id) =>
    /encode/i.test(graph[id]?.class_type ?? ""),
  );
  let positiveDone = false;
  for (const id of textNodes) {
    const negative =
      neg.has(id) ||
      (!pos.has(id) && /negative|négatif/i.test(graph[id]._meta?.title ?? ""));
    if (!negative && !positiveDone) {
      set(id, "text", "prompt");
      positiveDone = true;
      continue;
    }
    set(id, "text", "negative");
  }

  for (const id of Object.keys(graph)) {
    const cls = graph[id].class_type;
    if (/^ksampler/i.test(cls)) {
      set(id, "seed", "seed");
      set(id, "steps", "steps");
      set(id, "cfg", "cfg");
      set(id, "sampler_name", "sampler");
      set(id, "scheduler", "scheduler");
    } else if (/emptylatent/i.test(cls)) {
      set(id, "width", "width");
      set(id, "height", "height");
      set(id, "batch_size", "batch");
    } else if (/checkpointloader/i.test(cls)) {
      set(id, "ckpt_name", "model");
    } else if (/^vaeloader$/i.test(cls)) {
      set(id, "vae_name", "vae");
    }
  }
  return { graph, bound };
}

/** The binding key a whole-value placeholder refers to, or an empty string. */
export function bindingKeyOf(value: unknown): string {
  if (typeof value !== "string") return "";
  return WHOLE.exec(value)?.[1] ?? "";
}

/** What the placeholder currently resolves to, for the canvas chips. */
export function resolvedText(key: string, settings: Settings): string {
  const binding = bindingOf(key);
  if (!binding) return "—";
  const value = binding.value(settings);
  if (typeof value !== "string") return String(value);
  const flat = value.replace(/\s+/g, " ").trim();
  return flat.length > 40 ? `${flat.slice(0, 40)}…` : flat || "—";
}

/** Placeholders the graph uses, with a count, for the studio summary strip. */
export function boundList(graph: Workflow | null): { key: string; label: string; count: number }[] {
  const counts = new Map<string, number>();
  if (graph)
    for (const node of Object.values(graph))
      for (const value of Object.values(node.inputs ?? {})) {
        if (typeof value !== "string") continue;
        const whole = bindingKeyOf(value);
        if (whole) {
          counts.set(whole, (counts.get(whole) ?? 0) + 1);
          continue;
        }
        if (!value.includes("{{")) continue;
        for (const match of value.matchAll(ANY)) {
          const key = match[1];
          counts.set(key, (counts.get(key) ?? 0) + 1);
        }
      }
  return BINDING_KEYS.filter((key) => (counts.get(key) ?? 0) > 0).map((key) => ({
    key,
    label: bindingOf(key)?.label ?? key,
    count: counts.get(key) ?? 0,
  }));
}

/** Compact summary of a single field for the canvas. */
export function fieldPreview(field: Field, limit = 46): string {
  const value = field.value;
  if (typeof value === "string") {
    const flat = value.replace(/\s+/g, " ").trim();
    return flat.length > limit ? `${flat.slice(0, limit)}…` : flat || "—";
  }
  if (typeof value === "number" || typeof value === "boolean")
    return String(value);
  return "…";
}
