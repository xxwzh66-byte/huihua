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
    if (path === "/api/system_stats") return { system: { comfyui_version: "0.3.40" }, devices: [{ name: "cuda:0 NVIDIA GeForce RTX 4090", type: "cuda", vram_total: 25757220864, vram_free: 23113478144, torch_vram_total: 0, torch_vram_free: 0 }] };
    if (path === "/api/object_info") return info;
    if (path === "/api/queue") return { queue_running: [], queue_pending: [] };
    if (path === "/api/prompt") return { prompt_id: "run-1" };
    if (path.startsWith("/api/history")) return {};
  }
  return {};
}

const seed = (wf) => {
  localStorage.setItem("mochi-language", "zh-CN");
  localStorage.setItem("mochi-update-auto", "false");
  localStorage.setItem("settings", JSON.stringify({ model: "anima.safetensors", positive: "1girl, silver hair, quiet old library, warm afternoon light, long hair, sitting by the window", negative: "blurry, low quality", width: 1024, height: 1024, steps: 30, cfg: 5, seed: "", sampler: "euler_ancestral", scheduler: "normal", batch: 1, batches: 1, loras: [], vae: "", clipSkip: 1, hires: { enabled: false, method: "nearest-exact", scale: 2, steps: 20, denoise: 0.7 }, upscale: { enabled: false, method: "nearest-exact", scale: 2 } }));
  localStorage.setItem("workflow-library-v1", JSON.stringify([{ id: "w1", name: "人像质感 v3", at: Date.now(), nodes: 7, graph: wf }]));
  localStorage.setItem("prompt-fix-presets-v1", JSON.stringify([{ id: "f1", name: "电影感", at: Date.now(), assembly: { before: "masterpiece", after: "cinematic light", quality: "best quality", qualityNegative: "" } }]));
};

const browser = await chromium.launch();

async function open(width, height) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  page.on("pageerror", (e) => console.log("  pageerror:", e.message));
  await page.route("**/__native", async (route) => {
    const body = JSON.parse(route.request().postData() || "{}");
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ value: answer(body.command, body.args) }) });
  });
  await page.addInitScript(seed, workflow);
  await page.goto(URL, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".generate-bar", { timeout: 20000 });
  await page.waitForTimeout(1500);
  return page;
}

for (const [label, width, height] of [["mobile", 390, 844], ["tablet", 768, 1024], ["desktop", 1180, 900], ["wide", 1440, 1000]]) {
  const page = await open(width, height);
  const report = await page.evaluate(() => {
    window.scrollTo(0, 0);
    const root = document.querySelector(".atelier-layout");
    const base = root.getBoundingClientRect().top + window.scrollY;
    const rows = [...root.children].map((el) => {
      const r = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      const name = `${(el.className || "").toString().split(" ").filter(Boolean).slice(0, 2).join(".") || el.tagName.toLowerCase()}`;
      return `${name.padEnd(28)} top=${Math.round(r.top + window.scrollY - base)} h=${Math.round(r.height)} w=${Math.round(r.width)} order=${style.order} col=${style.gridColumn} row=${style.gridRow}`;
    });
    const bar = document.querySelector(".generate-bar").getBoundingClientRect();
    const panel = document.querySelector(".render-panel").getBoundingClientRect();
    return {
      rows,
      pageHeight: Math.round(document.documentElement.scrollHeight),
      barInsidePanel: Math.round(bar.bottom - panel.bottom),
      barAbsTop: Math.round(bar.top + window.scrollY),
    };
  });
  console.log(`--- ${label} ${width}x${height}  page=${report.pageHeight}  barBottomVsPanel=${report.barInsidePanel}  barAbsTop=${report.barAbsTop}`);
  report.rows.forEach((r) => console.log("   ", r));
  await page.screenshot({ path: `_build/v122-${label}-top.png` });
  await page.screenshot({ path: `_build/v122-${label}.png`, fullPage: true });
  await page.close();
}

await browser.close();
