import "./testLocale";
import { describe, expect, it } from "vitest";
import { applySkips, graphStats, skipStatus, skippedNodes } from "./nodeSkip";
import type { ObjectInfo, Workflow } from "./api";

const info: ObjectInfo = {
  CheckpointLoaderSimple: {
    input: { required: { ckpt_name: [["sdxl.safetensors"]] } },
    output: ["MODEL", "CLIP", "VAE"],
  },
  CLIPTextEncode: {
    input: { required: { text: ["STRING", {}], clip: ["CLIP", {}] } },
    output: ["CONDITIONING"],
  },
  KSampler: {
    input: {
      required: {
        model: ["MODEL", {}],
        positive: ["CONDITIONING", {}],
        negative: ["CONDITIONING", {}],
        latent_image: ["LATENT", {}],
      },
    },
    output: ["LATENT"],
  },
  EmptyLatentImage: {
    input: { required: { width: ["INT", {}], height: ["INT", {}] } },
    output: ["LATENT"],
  },
  VAEDecode: {
    input: { required: { samples: ["LATENT", {}], vae: ["VAE", {}] } },
    output: ["IMAGE"],
  },
  ImageScale: {
    input: { required: { image: ["IMAGE", {}], width: ["INT", {}] } },
    output: ["IMAGE"],
  },
  SaveImage: {
    input: { required: { images: ["IMAGE", {}] } },
    output: [],
  },
};

function graph(): Workflow {
  return {
    "1": {
      class_type: "CheckpointLoaderSimple",
      inputs: { ckpt_name: "sdxl.safetensors" },
    },
    "2": { class_type: "CLIPTextEncode", inputs: { text: "a", clip: ["1", 1] } },
    "3": { class_type: "CLIPTextEncode", inputs: { text: "b", clip: ["1", 1] } },
    "5": {
      class_type: "KSampler",
      inputs: {
        model: ["1", 0],
        positive: ["2", 0],
        negative: ["3", 0],
        latent_image: ["9", 0],
      },
    },
    "9": {
      class_type: "EmptyLatentImage",
      inputs: { width: 1024, height: 1024 },
    },
    "6": { class_type: "VAEDecode", inputs: { samples: ["5", 0], vae: ["1", 2] } },
    "7": { class_type: "ImageScale", inputs: { image: ["6", 0], width: 1024 } },
    "8": { class_type: "SaveImage", inputs: { images: ["7", 0] } },
  };
}

describe("node skipping", () => {
  it("reports node and link counts", () => {
    expect(graphStats(graph())).toEqual({ nodes: 8, links: 10 });
  });

  it("leaves a graph without _skip untouched", () => {
    const g = graph();
    const report = applySkips(g, info);
    expect(report.removed).toEqual([]);
    expect(report.rewired).toBe(0);
    expect(report.graph).toBe(g);
  });

  it("bypasses a middle node and rewires its consumer to the upstream", () => {
    const g = graph();
    g["7"]._skip = true;
    const report = applySkips(g, info);
    expect(report.removed).toEqual(["7"]);
    expect(report.rewired).toBe(1);
    expect(report.graph["8"].inputs.images).toEqual(["6", 0]);
    expect(report.graph["7"]).toBeUndefined();
  });

  it("walks a whole skipped chain up to a real node", () => {
    const g = graph();
    g["7"]._skip = true;
    g["6"]._skip = true;
    const report = applySkips(g, info);
    expect(report.graph["8"].inputs.images).toEqual(["5", 0]);
  });

  it("drops the link when a skipped node has no upstream left", () => {
    const g = graph();
    g["1"]._skip = true;
    const report = applySkips(g, info);
    expect(report.graph["1"]).toBeUndefined();
    expect(report.graph["2"].inputs.clip).toBeUndefined();
  });

  it("lists the skipped ids", () => {
    const g = graph();
    g["7"]._skip = true;
    g["6"]._skip = true;
    expect(skippedNodes(g)).toEqual(["6", "7"]);
  });

  it("refuses to skip a node with no upstream input", () => {
    expect(skipStatus(graph(), "1", info).canSkip).toBe(false);
  });

  it("allows a chain node and a leaf", () => {
    const g = graph();
    expect(skipStatus(g, "7", info).canSkip).toBe(true);
    expect(skipStatus(g, "7", info).typeMatch).toBe(true);
    expect(skipStatus(g, "8", info).canSkip).toBe(true);
  });
});
