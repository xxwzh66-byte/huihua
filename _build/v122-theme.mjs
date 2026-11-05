import { chromium } from "@playwright/test";

const URL = "http://127.0.0.1:14420/";

const info = {
  CheckpointLoaderSimple: { input: { required: { ckpt_name: [["sd_xl_base_1.0.safetensors", "anima.safetensors"], {}] } }, output: ["MODEL", "CLIP", "VAE"] },
  CLIPTextEncode: { input: { required: { text: ["STRING", { multiline: true }], clip: ["CLIP", {}] } }, output: ["CONDITIONING"] },
  EmptyLatentImage: { input: { required: { width: ["INT", { min: 64, max: 4096, step: 8 }], height: ["INT", { min: 64, max: 4096, step: 8 }], batch_size: ["INT", { min: 1, max: 8 }] } }, output: ["LATENT"] },
  KSampler: { input: { required: { model: ["MODEL", {}], positive: ["CONDITIONING", {}], negative: ["CONDITIONING", {}], latent_image: ["LATENT", {}], seed: ["INT", { min: 0, max: 18446744073709551615 }], steps: ["INT", { min: 1, max: 150 }], cfg: ["FLOAT", { min: 0, max: 30, step: 0.1 }], sampler_name: [["euler_ancestral", "dpmpp_2m"], {}], scheduler: [["normal", "karras"], {}], denoise: ["FLOAT", { min: 0, max: 1, step: 0.01 }] } }, output: ["LATENT"] },
  VAEDecode: { input: { required: { samples: ["LATENT", {}], vae: ["VAE", {}] } }, output: ["IMAGE"] },
  SaveImage: { input: { required: { images: ["IMAGE", {}], filename_prefix: ["STRING", {}] } }, output: [] },
};

const workflow = {
  "1": { class_type: "CheckpointLoaderSimple", inputs: { ckpt_name: "{{model}}" }, _meta: { title: "模型" } },
  "2": { class_type: "CLIPTextEncode", inputs: { text: "{{prompt}}", clip: ["1", 1] }, _meta: { title: "正向提示词" } },
  "3": { class_type: "CLIPTextEncode", inputs: { text: "{{negative}}", clip: ["1", 1] }, _meta: { title: "负向提示词" } },
  "4": { class_type: "EmptyLatentImage", inputs: { width: "{{width}}", height: "{{height}}", batch_size: 1 }, _meta: { title: "画布" } },
  "5": { class_type: "KSampler", inputs: { model: ["1", 0], positive: ["2", 0], negative: ["3", 0], latent_image: ["4", 0], seed: 42, steps: 30, cfg: 5, sampler_name: "{{sampler}}", scheduler: "{{scheduler}}", denoise: 1 }, _meta: { title: "采样" } },
  "6": { class_type: "VAEDecode", inputs: { samples: ["5", 0], vae: ["1", 2] }, _meta: { title: "解码" } },
  "7": { class_type: "SaveImage", inputs: { images: ["6", 0], filename_prefix: "ComfyPocket" }, _meta: { title: "保存" } },
};

const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

function answer(command, args) {
  if (command === "lock_status") return { supported: false, available: false, enabled: false, unlocked: true, delay: 0, hideRecents: false, autoPrompt: false };
  if (command === "restore") return "http://192.168.1.8:8188";
  if (command === "image") return PNG;
  if (command === "save_image") return "";
  if (command === "update_action") return { supported: false, phase: "idle", available: false };
  if (command === "llm_get") return { base_url: "https://api.example.com/v1", model: "gpt-4o-mini", temperature: 0.7, has_key: true };
  if (command === "api") {
    const path = args?.path ?? "";
    if (path === "/api/system_stats") return { system: {}, devices: [{ name: "cuda:0 NVIDIA GeForce RTX 4090", type: "cuda", vram_total: 1, vram_free: 23113478144 }] };
    if (path === "/api/object_info") return info;
    if (path === "/api/queue") return { queue_running: [], queue_pending: [] };
    if (path === "/api/prompt") return { prompt_id: "run-1" };
    if (path.startsWith("/api/history")) return {};
  }
  return {};
}

const seed = (theme, wf) => {
  localStorage.setItem("mochi-language", "zh-CN");
  localStorage.setItem("mochi-update-auto", "false");
  localStorage.setItem("mochi-theme", theme);
  localStorage.setItem("settings", JSON.stringify({ model: "anima.safetensors", positive: "1girl, silver hair, quiet old library", negative: "blurry, low quality", width: 1024, height: 1024, steps: 30, cfg: 5, seed: "", sampler: "euler_ancestral", scheduler: "normal", batch: 1, batches: 1, loras: [], vae: "", clipSkip: 1, hires: { enabled: false, method: "nearest-exact", scale: 2, steps: 20, denoise: 0.7 }, upscale: { enabled: false, method: "nearest-exact", scale: 2 } }));
  localStorage.setItem("workflow-library-v1", JSON.stringify([{ id: "w1", name: "人像质感 v3", at: Date.now(), nodes: 7, graph: wf }]));
};

const browser = await chromium.launch();

for (const theme of ["pure", "warm", "mint", "ink", "night"]) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  page.on("pageerror", (e) => console.log("  pageerror:", e.message));
  await page.route("**/__native", async (route) => {
    const body = JSON.parse(route.request().postData() || "{}");
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ value: answer(body.command, body.args) }) });
  });
  await page.addInitScript(seed, theme, workflow);
  await page.goto(URL, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".generate-bar", { timeout: 20000 });
  await page.waitForTimeout(1200);
  const probe = await page.evaluate(() => {
    const names = [".studio-pc", ".studio-prompts", ".prompt-entry.positive-entry", ".prompt-entry.negative-entry",
      ".render-panel", ".output-empty", ".generate-bar", ".card-heading > button", ".collapsible-card", ".prompt-shortcuts button"];
    const out = {};
    for (const n of names) {
      const el = document.querySelector(n);
      if (!el) { out[n] = "missing"; continue; }
      const s = getComputedStyle(el);
      out[n] = `${s.backgroundColor} / ink ${s.color}`;
    }
    return { theme: document.documentElement.dataset.theme, out };
  });
  console.log(`--- theme ${theme} (dataset=${probe.theme})`);
  for (const [k, v] of Object.entries(probe.out)) console.log(`    ${k.padEnd(30)} ${v}`);
  await page.screenshot({ path: `_build/v122-theme-${theme}.png` });
  await page.close();
}

await browser.close();
