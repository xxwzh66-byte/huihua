import { chromium } from "@playwright/test";

const info = {
  CheckpointLoaderSimple: {
    class_type: "CheckpointLoaderSimple",
    input: { required: { ckpt_name: [["sd_xl_base_1.0.safetensors", "anima.safetensors"], {}] } },
  },
  CLIPTextEncode: {
    class_type: "CLIPTextEncode",
    input: { required: { text: ["STRING", { multiline: true }], clip: ["CLIP", {}] } },
  },
  EmptyLatentImage: {
    class_type: "EmptyLatentImage",
    input: {
      required: {
        width: ["INT", { min: 64, max: 4096, step: 8 }],
        height: ["INT", { min: 64, max: 4096, step: 8 }],
        batch_size: ["INT", { min: 1, max: 8 }],
      },
    },
  },
  KSampler: {
    class_type: "KSampler",
    input: {
      required: {
        model: ["MODEL", {}],
        seed: ["INT", { min: 0, max: 18446744073709551615 }],
        steps: ["INT", { min: 1, max: 150 }],
        cfg: ["FLOAT", { min: 0, max: 30 }],
        sampler_name: [["euler_ancestral", "dpmpp_2m"], {}],
        scheduler: [["normal", "karras"], {}],
        positive: ["CONDITIONING", {}],
        negative: ["CONDITIONING", {}],
        latent_image: ["LATENT", {}],
        denoise: ["FLOAT", { min: 0, max: 1 }],
      },
    },
  },
  VAEDecode: { class_type: "VAEDecode", input: { required: { samples: ["LATENT", {}], vae: ["VAE", {}] } } },
  SaveImage: { class_type: "SaveImage", input: { required: { images: ["IMAGE", {}], filename_prefix: ["STRING", {}] } } },
};

const workflow = {
  "1": { class_type: "CheckpointLoaderSimple", inputs: { ckpt_name: "sd_xl_base_1.0.safetensors" } },
  "2": { class_type: "CLIPTextEncode", inputs: { text: "{{prompt}}", clip: ["1", 1] } },
  "3": { class_type: "CLIPTextEncode", inputs: { text: "{{negative}}", clip: ["1", 1] } },
  "4": { class_type: "EmptyLatentImage", inputs: { width: 1024, height: 1024, batch_size: 1 } },
  "5": {
    class_type: "KSampler",
    inputs: {
      model: ["1", 0], seed: 42, steps: 30, cfg: 5,
      sampler_name: "euler_ancestral", scheduler: "normal",
      positive: ["2", 0], negative: ["3", 0], latent_image: ["4", 0], denoise: 1,
    },
  },
  "6": { class_type: "VAEDecode", inputs: { samples: ["5", 0], vae: ["1", 2] } },
  "7": { class_type: "SaveImage", inputs: { images: ["6", 0], filename_prefix: "ComfyPocket/ComfyPocket" } },
};

function answer(command, args) {
  if (command === "lock_status")
    return { supported: false, available: false, enabled: false, unlocked: true, delay: 0, hideRecents: false, autoPrompt: false };
  if (command === "restore") return "http://192.168.1.8:8188";
  if (command === "image" || command === "save_image") return "";
  if (command === "update_action") return { supported: false, phase: "idle", available: false };
  if (command === "llm_get") return { base_url: "", model: "", temperature: 0.7, has_key: false };
  if (command === "api") {
    const path = args?.path ?? "";
    if (path === "/api/system_stats")
      return {
        system: { os: "linux", comfyui_version: "0.3.40", python_version: "3.12" },
        devices: [{ name: "cuda:0 NVIDIA GeForce RTX 4090", type: "cuda", vram_total: 25757220864, vram_free: 23113478144, torch_vram_total: 25757220864, torch_vram_free: 23113478144 }],
      };
    if (path === "/api/object_info") return info;
    if (path === "/api/queue") return { queue_running: [], queue_pending: [] };
    if (path.startsWith("/api/history")) return {};
  }
  return {};
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 900 } });
await page.route("**/__native", async (route) => {
  const body = JSON.parse(route.request().postData() || "{}");
  await route.fulfill({ contentType: "application/json", body: JSON.stringify({ value: answer(body.command, body.args) }) });
});
page.on("pageerror", (e) => console.log("pageerror:", e.message));

// Fresh install: no onboarding flag at all — v1.15 must go straight to the app.
await page.addInitScript(() => {
  localStorage.clear();
  localStorage.setItem("mochi-language", "zh-CN");
  localStorage.setItem("mochi-update-auto", "false");
  localStorage.setItem("settings", JSON.stringify({ model: "sd_xl_base_1.0.safetensors", sampler: "euler_ancestral", scheduler: "normal" }));
});
await page.addInitScript((graph) => {
  localStorage.setItem("workflow-library-v1", JSON.stringify([{ id: "w1", name: "人像质感 v3", at: Date.now(), nodes: 7, graph }]));
}, workflow);
await page.goto("http://127.0.0.1:14420/", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(2500);

console.log("onboarding screens:", await page.locator(".onboarding-step, .wizard, [data-onboarding]").count());
console.log("nav buttons:", JSON.stringify(await page.locator("aside nav button").allInnerTexts()));
await page.screenshot({ path: "D:\\demo\\Paint-v1\\_build\\v115-first-run.png", fullPage: false });

// Wardrobe page (4th nav item).
const nav = page.locator("aside nav button");
await nav.nth(3).click();
await page.waitForTimeout(900);
console.log("wardrobe cards:", JSON.stringify(await page.locator(".theme-card strong").allInnerTexts()));
await page.locator(".theme-card").nth(1).click();
await page.waitForTimeout(400);
console.log("groups:", await page.locator(".theme-choices button").count());
await page.locator(".glossary-tag").first().click();
await page.waitForTimeout(300);
await page.screenshot({ path: "D:\\demo\\Paint-v1\\_build\\v115-wardrobe.png", fullPage: false });

// Prompt editor (lives on the Atelier page): no voice entry, no autocomplete
// switch, no offline tag bubble, no "check" tool.
await nav.nth(0).click();
await page.waitForTimeout(800);
const entry = page.locator(".prompt-entry").first();
await entry.scrollIntoViewIfNeeded();
await page.waitForTimeout(300);
await entry.click();
await page.waitForTimeout(900);
console.log("voice entry:", await page.locator(".voice-entry").count());
console.log("autocomplete switch:", await page.locator(".autocomplete-setting").count());
console.log("suggestion bubble:", await page.locator(".suggestion-bubble").count());
console.log("prompt tools:", JSON.stringify(await page.locator(".prompt-tools button").allInnerTexts()));
await page.screenshot({ path: "D:\\demo\\Paint-v1\\_build\\v115-editor.png", fullPage: false });
await browser.close();
