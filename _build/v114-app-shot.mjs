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
await page.addInitScript(() => {
  localStorage.setItem("onboarding-done", "true");
  localStorage.setItem("mochi-language", "zh-CN");
  localStorage.setItem("mochi-update-auto", "false");
  localStorage.setItem("settings", JSON.stringify({ model: "sd_xl_base_1.0.safetensors", sampler: "euler_ancestral", scheduler: "normal" }));
});
await page.addInitScript((graph) => {
  localStorage.setItem("workflow-library-v1", JSON.stringify([{ id: "w1", name: "人像质感 v3", at: Date.now(), nodes: 7, graph }]));
}, workflow);
await page.goto("http://127.0.0.1:14420/", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(2500);

// Load the workflow from the shelf so the canvas has something to draw.
await page.locator(".collapsible-card h2 button").first().click();
await page.waitForTimeout(400);
const picker = page.locator(".shelf-picker select");
if (await picker.count()) {
  await picker.selectOption("w1");
  await page.waitForTimeout(500);
}
await page.locator("#studio-workflow").scrollIntoViewIfNeeded();
await page.waitForTimeout(300);
await page.screenshot({ path: "D:\\demo\\Paint-v1\\_build\\app-v114-canvas.png", fullPage: false });

const nodes = await page.locator(".graph-node").count();
console.log("graph nodes:", nodes, "| picker options:", await picker.locator("option").count());
if (nodes) {
  await page.locator(".graph-node").filter({ hasText: "KSampler" }).first().click();
  await page.waitForTimeout(400);
  await page.locator(".canvas-detail").scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  await page.screenshot({ path: "D:\\demo\\Paint-v1\\_build\\app-v114-detail.png" });
}

// Settings page (last sidebar nav button = Paramètres/设置).
await page.locator("aside nav button").last().click();
await page.waitForTimeout(1200);
// Open the "应用 / Application" group, which holds the default-save switch.
const groups = page.locator("details.settings-group");
const groupCount = await groups.count();
await groups.nth(groupCount - 1).locator("summary").click();
await page.waitForTimeout(500);
await groups.nth(groupCount - 1).scrollIntoViewIfNeeded();
await page.waitForTimeout(300);
await page.screenshot({ path: "D:\\demo\\Paint-v1\\_build\\app-v114-settings.png", fullPage: true });
const switches = await page.locator(".switch-row strong").allInnerTexts();
console.log("switch rows:", JSON.stringify(switches));
const resumeCount = await page.locator(".setup-mobile-resume").count();
console.log("legacy setup buttons:", resumeCount);
const autoSave = page.locator(".switch-row").filter({ hasText: "默认保存" }).locator('input[type="checkbox"]');
console.log("auto-save checked:", await autoSave.isChecked().catch(() => "n/a"));
await autoSave.click({ force: true }).catch(() => {});
await page.waitForTimeout(200);
console.log("auto-save stored:", await page.evaluate(() => localStorage.getItem("auto-save")));
await browser.close();
