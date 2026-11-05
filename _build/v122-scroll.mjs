import { chromium } from "@playwright/test";
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 390, height: 844 } });
await p.route("**/__native", async (route) => {
  const body = JSON.parse(route.request().postData() || "{}");
  const c = body.command, a = body.args || {};
  let data = { ok: true };
  if (c === "lock_status") data = { supported: true, available: true, enabled: false, unlocked: true, autoPrompt: false, delay: 0, hideRecents: false };
  else if (c === "restore") data = "http://192.168.1.8:8188";
  else if (c === "image") data = "";
  else if (c === "update_action") data = { supported: false, phase: "idle", available: false };
  else if (c === "llm_get") data = { base_url: "", model: "", has_key: false, temperature: 0.7 };
  else if (c === "api") {
    const path = a.path || "";
    if (path.includes("system_stats")) data = { system: { ram_free: 1 }, devices: [{ name: "RTX 4090", vram_free: 23113478144, vram_total: 25757220864 }] };
    else if (path.includes("object_info")) data = {
      CheckpointLoaderSimple: { input: { required: { ckpt_name: [["anima.safetensors"], {}] } }, output: ["MODEL", "CLIP", "VAE"] },
      CLIPTextEncode: { input: { required: { text: ["STRING", {}], clip: ["CLIP", {}] } }, output: ["CONDITIONING"] },
      EmptyLatentImage: { input: { required: { width: ["INT", { default: 1024 }], height: ["INT", { default: 1024 }], batch_size: ["INT", { default: 1 }] } }, output: ["LATENT"] },
      KSampler: { input: { required: { model: ["MODEL", {}], positive: ["CONDITIONING", {}], negative: ["CONDITIONING", {}], latent_image: ["LATENT", {}], seed: ["INT", { default: 0 }], steps: ["INT", { default: 30 }], cfg: ["FLOAT", { default: 5 }], sampler_name: [["euler_ancestral"], {}], scheduler: [["normal"], {}], denoise: ["FLOAT", { default: 1 }] } }, output: ["LATENT"] },
      VAEDecode: { input: { required: { samples: ["LATENT", {}], vae: ["VAE", {}] } }, output: ["IMAGE"] },
      SaveImage: { input: { required: { images: ["IMAGE", {}], filename_prefix: ["STRING", {}] } }, output: [] }
    };
    else if (path.includes("queue")) data = { queue_running: [], queue_pending: [] };
    else data = {};
  }
  await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ value: data }) });
});
await p.addInitScript(() => {
  localStorage.setItem("mochi-language", "zh-CN");
  localStorage.setItem("mochi-update-auto", "false");
  localStorage.setItem("workflow-library-v1", JSON.stringify([{ id: "w1", name: "人像质感 v3", at: Date.now(), nodes: 7, graph: { "1": { class_type: "CheckpointLoaderSimple", inputs: { ckpt_name: "{{model}}" }, _meta: { title: "模型" } }, "2": { class_type: "CLIPTextEncode", inputs: { text: "{{prompt}}", clip: ["1",1] }, _meta: { title: "正向提示词" } }, "3": { class_type: "CLIPTextEncode", inputs: { text: "{{negative}}", clip: ["1",1] }, _meta: { title: "负向提示词" } }, "4": { class_type: "EmptyLatentImage", inputs: { width: "{{width}}", height: "{{height}}", batch_size: 1 } }, "5": { class_type: "KSampler", inputs: { model: ["1",0], positive: ["2",0], negative: ["3",0], latent_image: ["4",0], seed: 42, steps: 30, cfg: 5, sampler_name: "{{sampler}}", scheduler: "{{scheduler}}", denoise: 1 } }, "6": { class_type: "VAEDecode", inputs: { samples: ["5",0], vae: ["1",2] } }, "7": { class_type: "SaveImage", inputs: { images: ["6",0], filename_prefix: "ComfyPocket" } } } }]));
  localStorage.setItem("settings", JSON.stringify({ model: "anima.safetensors", positive: "1girl, silver hair, quiet old library", negative: "blurry, low quality", width: 1024, height: 1024, steps: 30, cfg: 5, seed: "", sampler: "euler_ancestral", scheduler: "normal", batch: 1, batches: 1, loras: [], vae: "", clipSkip: 1 }));
});
await p.goto("http://127.0.0.1:14420");
await p.waitForTimeout(2500);
await p.evaluate(() => document.querySelectorAll("aside nav button")[0]?.click());
await p.waitForTimeout(1200);
for (const [i, y] of [0, 380, 900, 99999].entries()) {
  await p.evaluate((v) => window.scrollTo(0, v), y);
  await p.waitForTimeout(400);
  await p.screenshot({ path: `D:/demo/Paint-v1/_build/v122-scroll-${i}.png` });
}
console.log("done");
await b.close();
