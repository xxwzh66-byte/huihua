import { chromium } from "@playwright/test";
import { deflateSync } from "node:zlib";

/**
 * v1.16 screenshots: wardrobe → scene description, and the detailed prompt
 * sheet behind a generated picture. Everything is mocked, no ComfyUI needed.
 */

const encoder = new TextEncoder();
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();
function crc32(bytes) {
  let c = 0xffffffff;
  for (const byte of bytes) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  const body = new Uint8Array(4 + data.length);
  body.set(encoder.encode(type), 0);
  body.set(data, 4);
  out.set(body, 4);
  view.setUint32(8 + data.length, crc32(body));
  return out;
}
function pngDataUrl(tags, size = 1) {
  const parts = [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])];
  const header = new Uint8Array(13);
  const hv = new DataView(header.buffer);
  hv.setUint32(0, size);
  hv.setUint32(4, size);
  header[8] = 8;
  header[9] = 2;
  parts.push(chunk("IHDR", header));
  for (const [key, value] of Object.entries(tags)) {
    const body = new Uint8Array(key.length + 1 + encoder.encode(value).length);
    body.set(encoder.encode(key), 0);
    body[key.length] = 0;
    body.set(encoder.encode(value), key.length + 1);
    parts.push(chunk("tEXt", body));
  }
  const row = new Uint8Array(1 + size * 3);
  row.fill(0xdd, 1);
  const raw = new Uint8Array(row.length * size);
  for (let y = 0; y < size; y++) raw.set(row, y * row.length);
  parts.push(chunk("IDAT", deflateSync(raw)));
  parts.push(chunk("IEND", new Uint8Array(0)));
  const all = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    all.set(part, offset);
    offset += part.length;
  }
  let binary = "";
  for (const byte of all) binary += String.fromCharCode(byte);
  return `data:image/png;base64,${btoa(binary)}`;
}

const settings = {
  model: "anima.safetensors",
  positive:
    "1girl, silver hair, quiet library, warm afternoon light, soft rim light, wooden shelves, shallow depth of field",
  negative: "blurry, low quality, watermark",
  width: 1024,
  height: 1344,
  steps: 28,
  cfg: 5.5,
  sampler: "euler_ancestral",
  scheduler: "normal",
  seed: "123456789",
  loras: [{ name: "detail_tweaker", strength: 0.6 }],
  vae: "",
};
const savedPng = pngDataUrl({ comfy_pocket: JSON.stringify({ settings, version: 2 }) }, 4);

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

function answer(command, args) {
  if (command === "lock_status")
    return { supported: false, available: false, enabled: false, unlocked: true, delay: 0, hideRecents: false, autoPrompt: false };
  if (command === "restore") return "http://192.168.1.8:8188";
  if (command === "image") return savedPng;
  if (command === "save_image") return "";
  if (command === "update_action") return { supported: false, phase: "idle", available: false };
  if (command === "llm_get") return { base_url: "", model: "", temperature: 0.7, has_key: false };
  if (command === "api") {
    const path = args?.path ?? "";
    if (path === "/api/system_stats")
      return {
        system: { os: "linux", comfyui_version: "0.3.40", python_version: "3.12" },
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
    if (path.startsWith("/api/history"))
      return {
        done: {
          outputs: { "7": { images: [{ filename: "00042.png", subfolder: "", type: "output" }] } },
          status: { completed: true },
        },
      };
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
await page.addInitScript(() => {
  localStorage.clear();
  localStorage.setItem("mochi-language", "zh-CN");
  localStorage.setItem("mochi-update-auto", "false");
  localStorage.setItem(
    "settings",
    JSON.stringify({ model: "sd_xl_base_1.0.safetensors", sampler: "euler_ancestral", scheduler: "normal" }),
  );
});

const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
await page.goto("http://127.0.0.1:14420/", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(2500);

// 1. Wardrobe: pick the bedroom set and show the new send button.
await page.locator("aside nav button").nth(3).click();
await page.waitForTimeout(500);
await page.locator(".theme-card").nth(1).click();
await page.locator(".glossary-tag").filter({ hasText: "卧室" }).first().click();
await page.waitForTimeout(400);
await page.locator(".glossary-selection").scrollIntoViewIfNeeded();
await page.screenshot({ path: "D:\\demo\\Paint-v1\\_build\\v116-wardrobe-send.png" });
console.log("describe button:", await page.locator(".describe-send").count());

// 2. Send it into the prompt page's scene box.
await page.locator(".describe-send").click();
await page.waitForTimeout(900);
await page.screenshot({ path: "D:\\demo\\Paint-v1\\_build\\v116-describe-draft.png" });
const draft = await page.locator(".prompt-studio textarea").first().inputValue().catch(() => "");
console.log("draft:", draft.slice(0, 60));

// 3. Gallery → viewer → detailed prompt sheet.
await page.locator("aside nav button").nth(2).click();
const shot = page.locator(".gallery-grid .image-button").first();
await shot.waitFor({ timeout: 15000 });
await shot.click();
await page.waitForTimeout(900);
await page.screenshot({ path: "D:\\demo\\Paint-v1\\_build\\v116-viewer-actions.png" });
console.log("viewer buttons:", await page.locator(".viewer-actions button").count());
await page.getByRole("button", { name: "查看详细提示词" }).click();
await page.waitForTimeout(900);
await page.screenshot({ path: "D:\\demo\\Paint-v1\\_build\\v116-detail-sheet.png" });
console.log("detail rows:", await page.locator(".image-details .detail-rows > div").count());
console.log("errors:", errors.slice(0, 3));
await browser.close();
