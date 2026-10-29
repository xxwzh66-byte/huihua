import { chromium } from "playwright";

const GRAPH = {
  prompt: {
    "1": {
      class_type: "CheckpointLoaderSimple",
      inputs: { ckpt_name: "{{model}}" },
      _meta: { title: "Load Checkpoint" },
    },
    "2": {
      class_type: "CLIPTextEncode",
      inputs: { text: "{{prompt}}", clip: ["1", 1] },
      _meta: { title: "Positive" },
    },
    "3": {
      class_type: "CLIPTextEncode",
      inputs: { text: "blurry, low quality", clip: ["1", 1] },
      _meta: { title: "Negative" },
    },
    "4": {
      class_type: "EmptyLatentImage",
      inputs: { width: 1024, height: 1024, batch_size: 1 },
      _meta: {},
    },
    "5": {
      class_type: "KSampler",
      inputs: {
        seed: 42,
        steps: 30,
        cfg: 5,
        sampler_name: "{{sampler}}",
        scheduler: "normal",
        denoise: 1,
        model: ["1", 0],
        positive: ["2", 0],
        negative: ["3", 0],
        latent_image: ["4", 0],
      },
      _meta: { title: "Sampler" },
    },
    "6": {
      class_type: "VAEDecode",
      inputs: { samples: ["5", 0], vae: ["1", 2] },
      _meta: {},
    },
    "7": {
      class_type: "PreviewImage",
      inputs: { images: ["6", 0] },
      _meta: {},
    },
  },
};

const info = {
  CheckpointLoaderSimple: {
    input: {
      required: { ckpt_name: [["sdxl.safetensors", "anima.safetensors"], {}] },
    },
  },
  CLIPTextEncode: {
    input: { required: { text: ["STRING", {}], clip: ["CLIP", {}] } },
  },
  EmptyLatentImage: {
    input: {
      required: {
        width: ["INT", { default: 1024, min: 16, max: 16384, step: 8 }],
        height: ["INT", { default: 1024, min: 16, max: 16384, step: 8 }],
        batch_size: ["INT", { default: 1, min: 1, max: 64 }],
      },
    },
  },
  KSampler: {
    input: {
      required: {
        seed: ["INT", { default: 0 }],
        steps: ["INT", { default: 20, min: 1, max: 200 }],
        cfg: ["FLOAT", { default: 8, min: 0, max: 30 }],
        sampler_name: [["euler", "euler_ancestral", "dpmpp_2m"], {}],
        scheduler: [["normal", "karras"], {}],
        denoise: ["FLOAT", { default: 1 }],
        model: ["MODEL", {}],
        positive: ["CONDITIONING", {}],
        negative: ["CONDITIONING", {}],
        latent_image: ["LATENT", {}],
      },
    },
  },
  VAEDecode: {
    input: { required: { samples: ["LATENT", {}], vae: ["VAE", {}] } },
  },
  PreviewImage: { input: { required: { images: ["IMAGE", {}] } } },
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 412, height: 900 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
});

await page.addInitScript(() => {
  localStorage.setItem("onboarding-done", "true");
  localStorage.setItem("mochi-language", "zh-CN");
  localStorage.setItem("mochi-update-auto", "false");
  localStorage.removeItem("workflow-library-v1");
});

await page.route("**/__native", async (route) => {
  const { command, args } = route.request().postDataJSON();
  let value = null;
  if (command === "lock_status")
    value = { supported: false, available: false, enabled: false, unlocked: true };
  else if (command === "restore" || command === "connect_server")
    value = "http://192.168.1.8:8188";
  else if (command === "llm_get")
    value = { base_url: "", model: "", temperature: 0.7, has_key: false };
  else if (command === "update_action")
    value = {
      supported: false,
      phase: "idle",
      received: 0,
      ready: false,
      available: false,
      canInstall: false,
    };
  else if (command === "api") {
    const path = String(args?.path ?? "");
    if (path.startsWith("/api/system_stats"))
      value = {
        system: { os: "linux", python_version: "3.11", comfyui_version: "0.3.30" },
        devices: [
          {
            name: "cuda:0 NVIDIA GeForce RTX 4070 SUPER",
            type: "cuda",
            vram_total: 25757220864,
            vram_free: 9663676416,
            torch_vram_total: 0,
            torch_vram_free: 0,
          },
        ],
      };
    else if (path.startsWith("/api/object_info")) value = info;
    else if (path.startsWith("/api/queue")) value = { queue_running: [], queue_pending: [] };
    else if (path.startsWith("/api/history")) value = {};
    else value = {};
  }
  await route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ value }),
  });
});

await page.goto("http://127.0.0.1:14566/", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(4300);

// --- workflow mode, import, canvas, shelf ---
await page.locator(".studio-imports .segmented button").nth(1).click();
await page.waitForTimeout(800);
await page.locator(".collapsible-card h2 button").first().click();
await page.waitForTimeout(700);
console.log("card open:", await page.locator(".collapsible-card h2 button").first().getAttribute("aria-expanded"));

await page.setInputFiles('input[accept*="json"]', {
  name: "wf.json",
  mimeType: "application/json",
  buffer: Buffer.from(JSON.stringify(GRAPH)),
});
await page.waitForTimeout(1300);

const canvasText = await page.locator(".canvas-flow").first().innerText().catch(() => "none");
console.log("canvas head:", canvasText.slice(0, 220).replace(/\n+/g, " | "));
console.log("count badge:", await page.locator(".canvas-count").first().innerText().catch(() => "none"));
const chips = await page.$$eval(".canvas-bindings .binding-chip", (els) => els.map((e) => e.innerText.trim()));
console.log("binding chips:", JSON.stringify(chips));
const boundCount = await page.locator(".node-bound").count();
console.log("bound fields rendered:", boundCount);
await page.screenshot({ path: "D:/demo/Paint-v1/_build/shot-v111-canvas.png" });

// --- save the workflow ---
await page.locator(".shelf-save input").first().fill("测试工作流");
await page.locator(".shelf-save-button").first().click();
await page.waitForTimeout(700);
console.log("shelf count:", await page.locator(".shelf-count").first().innerText());
const stored = await page.evaluate(() => localStorage.getItem("workflow-library-v1"));
console.log("stored bytes:", stored ? stored.length : 0);
console.log("stored has placeholder:", stored ? stored.includes("{{prompt}}") : false);

// --- reopen from shelf ---
await page.locator(".shelf-count").first().click();
await page.waitForTimeout(600);
console.log("shelf items:", await page.locator(".shelf-item").count());
await page.screenshot({ path: "D:/demo/Paint-v1/_build/shot-v111-shelf.png" });
await page.locator(".shelf-item").first().click();
await page.waitForTimeout(700);
console.log("canvas after load:", (await page.locator(".canvas-flow").first().innerText()).slice(0, 60).replace(/\n+/g, " | "));

// --- binding dialog ---
await page.locator(".node-bind, .node-bound").first().click().catch(() => {});
await page.waitForTimeout(600);
const dialog = await page.locator(".binding-dialog").count();
console.log("binding dialog:", dialog);
await page.screenshot({ path: "D:/demo/Paint-v1/_build/shot-v111-binding.png" });
const options = await page.$$eval(".binding-list button, .binding-dialog button", (els) =>
  els.map((e) => e.innerText.trim()).filter(Boolean).slice(0, 20),
);
console.log("dialog buttons:", JSON.stringify(options));
await page.keyboard.press("Escape");
await page.waitForTimeout(500);
console.log("dialog after esc:", await page.locator(".binding-dialog").count());

// --- settings groups (security must be gone) ---
await page.keyboard.press("Escape");
await page.waitForTimeout(400);
await page.locator('nav button[title="设置"]').first().click({ force: true });
await page.waitForTimeout(1000);
const groups = await page.$$eval(".settings-group > summary", (els) =>
  els.map((e) => e.innerText.trim().split("\n")[0]),
);
console.log("settings groups:", JSON.stringify(groups));
await page.screenshot({ path: "D:/demo/Paint-v1/_build/shot-v111-settings.png", fullPage: false });

console.log("errors:", errors.length, errors.slice(0, 4));
await browser.close();
