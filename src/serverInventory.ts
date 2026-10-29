import { choices, type ObjectInfo, type Workflow } from "./api";
import { isLink } from "./workflowGraph";

export type ResourceGroup = {
  key: string;
  label: string;
  node: string;
  field: string;
  items: string[];
};

const groups: { key: string; label: string; node: string; field: string }[] = [
  {
    key: "checkpoints",
    label: "Checkpoints",
    node: "CheckpointLoaderSimple",
    field: "ckpt_name",
  },
  { key: "diffusion", label: "Diffusion models", node: "UNETLoader", field: "unet_name" },
  { key: "clip", label: "Text encoders", node: "CLIPLoader", field: "clip_name" },
  { key: "vae", label: "VAE", node: "VAELoader", field: "vae_name" },
  { key: "loras", label: "LoRAs", node: "LoraLoader", field: "lora_name" },
  {
    key: "upscale",
    label: "Upscalers",
    node: "UpscaleModelLoader",
    field: "model_name",
  },
];

/** Every model family the connected server exposes, straight from object_info. */
export function serverResources(info: ObjectInfo | null): ResourceGroup[] {
  if (!info) return [];
  return groups.map((group) => ({
    ...group,
    items: choices(info, group.node, group.field),
  }));
}

export function serverCounts(info: ObjectInfo | null) {
  const list = serverResources(info);
  return list.filter((group) => group.items.length > 0);
}

export type Loaded = {
  checkpoint: string;
  vae: string;
  clip: string;
  loras: string[];
  samplers: string[];
};

/** Read the loaders actually present in a workflow graph. */
export function loadedFrom(graph: Workflow | null, info: ObjectInfo | null): Loaded {
  void info;
  const loaded: Loaded = {
    checkpoint: "",
    vae: "",
    clip: "",
    loras: [],
    samplers: [],
  };
  if (!graph) return loaded;
  for (const node of Object.values(graph)) {
    const inputs = node.inputs ?? {};
    const text = (name: string) =>
      typeof inputs[name] === "string" ? (inputs[name] as string) : "";
    if (node.class_type === "CheckpointLoaderSimple" && text("ckpt_name"))
      loaded.checkpoint = text("ckpt_name");
    if (node.class_type === "UNETLoader" && text("unet_name"))
      loaded.checkpoint = text("unet_name");
    if (node.class_type === "VAELoader" && text("vae_name"))
      loaded.vae = text("vae_name");
    if (node.class_type === "CLIPLoader" && text("clip_name"))
      loaded.clip = text("clip_name");
    if (node.class_type === "DualCLIPLoader")
      loaded.clip = [text("clip_name1"), text("clip_name2")]
        .filter(Boolean)
        .join(" + ");
    if (node.class_type === "LoraLoader" && text("lora_name"))
      loaded.loras.push(text("lora_name"));
    if (node.class_type === "KSampler" && text("sampler_name"))
      loaded.samplers.push(text("sampler_name"));
  }
  return loaded;
}

/**
 * Which node output feeds the KSampler model input — used to point at the
 * checkpoint in use when the graph was rebuilt by another tool.
 */
export function rootModelNode(graph: Workflow | null, info: ObjectInfo | null) {
  if (!graph || !info) return "";
  for (const [id, node] of Object.entries(graph)) {
    if (node.class_type !== "KSampler" || !isLink(node.inputs?.model)) continue;
    let current = id;
    let next = node.inputs.model as [string, number];
    for (let guard = 0; guard < 40; guard++) {
      const target = graph[next[0]];
      if (!target) break;
      current = next[0];
      if (!isLink(target.inputs?.model)) break;
      next = target.inputs.model as [string, number];
    }
    if (current !== id) return current;
  }
  return "";
}
