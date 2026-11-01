import { chromium } from "@playwright/test";

/**
 * v1.18 visual check: the prompt assembly card (collapsed + open), and the
 * canvas with a bypassed node.
 */

const info = {
  CheckpointLoaderSimple: {
    class_type: "CheckpointLoaderSimple",
    input: {
      required: {
        ckpt_name: [["sd_xl_base_1.0.safetensors", "anima.safetensors"], {}],
      },
    },
    output: ["MODEL", "CLIP", "VAE"],
  },
  CLIPTextEncode: {
    class_type: "CLIPTextEncode",
    input: {
      required: { text: ["STRING", { multiline: true }], clip: ["CLIP", {}] },
    },
    output: ["CONDITIONING"],
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
    output: ["LATENT"],
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
    output: ["LATENT"],
  },
  VAEDecode: {
    class_type: "VAEDecode",
    input: { required: { samples: ["LATENT", {}], vae: ["VAE", {}] } },
    output: ["IMAGE"],
  },
  ImageScale: {
    class_type: "ImageScale",
    input: {
      required: {
        image: ["IMAGE", {}],
        upscale_method: [["nearest-exact", "bilinear"], {}],
        width: ["INT", {}],
        height: ["INT", {}],
      },
    },
    output: ["IMAGE"],
  },
  SaveImage: {
    class_type: "SaveImage",
    input: {
      required: { images: ["IMAGE", {}], filename_prefix: ["STRING", {}] },
    },
    output: [],
  },
};

const workflow = {
  "1": {
    class_type: "CheckpointLoaderSimple",
    inputs: { ckpt_name: "{{model}}" },
  },
  "2": {
    class_type: "CLIPTextEncode",
    inputs: { text: "{{prompt}}", clip: ["1", 1] },
  },
  "3": {
    class_type: "CLIPTextEncode",
    inputs: { text: "{{negative}}", clip: ["1", 1] },
  },
  "4": {
    class_type: "EmptyLatentImage",
    inputs: { width: "{{width}}", height: "{{height}}", batch_size: "{{batch}}" },
  },
  "5": {
    class_type: "KSampler",
    inputs: {
      model: ["1", 0],
      seed: "{{seed}}",
      steps: "{{steps}}",
      cfg: "{{cfg}}",
      sampler_name: "{{sampler}}",
      scheduler: "{{scheduler}}",
      positive: ["2", 0],
      negative: ["3", 0],
      latent_image: ["4", 0],
      denoise: 1,
    },
  },
  "6": { class_type: "VAEDecode", inputs: { samples: ["5", 0], vae: ["1", 2] } },
  "7": {
    class_type: "ImageScale",
    inputs: {
      image: ["6", 0],
      upscale_method: "nearest-exact",
      width: 1024,
      height: 1024,
    },
  },
  "8": {
    class_type: "SaveImage",
    inputs: { images: ["7", 0], filename_prefix: "ComfyPocket/ComfyPocket" },
  },
};

function answer(command, args) {
  if (command === "lock_status")
    return {
      supported: false,
      available: false,
      enabled: false,
      unlocked: true,
      delay: 0,
      hideRecents: false,
      autoPrompt: false,
    };
  if (command === "restore") return "http://192.168.1.8:8188";
  if (command === "image" || command === "save_image") return "";
  if (command === "update_action")
    return { supported: false, phase: "idle", available: false };
  if (command === "llm_get")
    return { base_url: "", model: "", temperature: 0.7, has_key: false };
  if (command === "api") {
    const path = args?.path ?? "";
    if (path === "/api/system_stats")
      return {
        system: {
          os: "linux",
          comfyui_version: "0.3.40",
          python_version: "3.12",
        },
        devices: [
          {
            name: "cuda:0 NVIDIA GeForce RTX 4090",
            type: "cuda",
            vram_total: 25757220864,
            vram_free: 23113478144,
            torch_vram_total: 25757220864,
            torch_vram_free: 23113478144,
          },
        ],
      };
    if (path === "/api/object_info") return info;
    if (path === "/api/queue") return { queue_running: [], queue_pending: [] };
    if (path.startsWith("/api/history")) return {};
    if (path === "/api/prompt") return { prompt_id: "run-1" };
  }
  return {};
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 900 } });
await page.route("**/__native", async (route) => {
  const body = JSON.parse(route.request().postData() || "{}");
  await route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({ value: answer(body.command, body.args) }),
  });
});
page.on("pageerror", (e) => console.log("pageerror:", e.message));

await page.addInitScript((graph) => {
  localStorage.clear();
  localStorage.setItem("mochi-language", "zh-CN");
  localStorage.setItem("mochi-update-auto", "false");
  localStorage.setItem(
    "settings",
    JSON.stringify({
      model: "sd_xl_base_1.0.safetensors",
      sampler: "euler_ancestral",
      scheduler: "normal",
      positive: "1girl, silver hair, quiet library",
    }),
  );
  localStorage.setItem(
    "workflow-library-v1",
    JSON.stringify([{ id: "w1", name: "人像质感 v3", at: Date.now(), nodes: 8, graph }]),
  );
}, workflow);
await page.goto("http://127.0.0.1:14420/", { waitUntil: "domcontentloaded" });
await page.waitForSelector(".generate-bar", { timeout: 15000 });
await page.waitForTimeout(1200);

// The assembly card is folded by default.
const card = page
  .locator(".collapsible-card")
  .filter({ has: page.locator(".card-heading", { hasText: "提示词装配" }) });
await card.scrollIntoViewIfNeeded();
await page.waitForTimeout(300);
await page.screenshot({ path: "D:\\demo\\Paint-v1\\_build\\v118-assembly-closed.png" });

await card.locator(".card-heading button").click();
await page.waitForTimeout(400);
await card.locator(".assembly-field textarea").nth(0).fill("masterpiece, best quality");
await card
  .locator(".assembly-field textarea")
  .nth(2)
  .fill("best quality, amazing quality, very aesthetic, absurdres");
await card.locator(".assembly-toggle").click();
await page.waitForTimeout(200);
await card
  .locator(".assembly-rules")
  .fill(
    [
      "# 规则表：最后一个 | 右边是动作",
      "hat | 替换 | beret",
      "1girl | 前置前 | solo",
      "/silver hair/ | 后置后 | silver hair, long hair",
      "library | 替换 | old library, warm light",
    ].join("\n"),
  );
await page.waitForTimeout(400);
await card.scrollIntoViewIfNeeded();
await page.waitForTimeout(300);
await page.screenshot({ path: "D:\\demo\\Paint-v1\\_build\\v118-assembly-open.png" });
console.log(
  "hit count:",
  await card.locator(".assembly-toggle small").innerText(),
);
console.log(
  "final:",
  await card.locator(".assembly-final code").innerText(),
);

// Canvas: skip the upscale node and screenshot the details panel.
const shelf = page
  .locator(".collapsible-card")
  .filter({ has: page.locator(".card-heading", { hasText: "API 工作流" }) });
await shelf.locator(".card-heading button").click();
await page.waitForTimeout(300);
await shelf.locator(".shelf-picker select").selectOption("w1");
await page.waitForTimeout(800);
const scale = page.locator(".graph-node").filter({ hasText: "ImageScale" }).first();
await scale.click();
await page.waitForTimeout(400);
await page.locator(".node-skip input").check();
await page.waitForTimeout(400);
await page.locator(".canvas-count").scrollIntoViewIfNeeded();
await page.waitForTimeout(300);
await page.screenshot({ path: "D:\\demo\\Paint-v1\\_build\\v118-canvas-skip.png" });
console.log("count:", await page.locator(".canvas-count").innerText());
console.log("skipped nodes:", await page.locator(".graph-node.skipped").count());
await browser.close();
