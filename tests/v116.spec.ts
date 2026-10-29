import { test, expect, type Page } from "@playwright/test";
import { deflateSync } from "node:zlib";

/**
 * v1.16 adds two ways to reach the prompts behind an image:
 *  - the wardrobe can send a picked set into the prompt page's scene box,
 *  - the image viewer gains a "detailed prompt" button that reads the PNG.
 */

const info = {
  CheckpointLoaderSimple: {
    class_type: "CheckpointLoaderSimple",
    input: {
      required: {
        ckpt_name: [["sd_xl_base_1.0.safetensors", "anima.safetensors"], {}],
      },
    },
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
  VAEDecode: {
    class_type: "VAEDecode",
    input: { required: { samples: ["LATENT", {}], vae: ["VAE", {}] } },
  },
  SaveImage: {
    class_type: "SaveImage",
    input: { required: { images: ["IMAGE", {}], filename_prefix: ["STRING", {}] } },
  },
};

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

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const byte of bytes) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
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

/**
 * A genuinely decodable 1×1 PNG that also carries the Comfy Pocket tEXt chunk,
 * so both the thumbnail pipeline and the metadata reader accept it.
 */
function pngDataUrl(tags: Record<string, string>): string {
  const parts: Uint8Array[] = [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])];
  const header = new Uint8Array(13);
  const hv = new DataView(header.buffer);
  hv.setUint32(0, 1);
  hv.setUint32(4, 1);
  header[8] = 8; // bit depth
  header[9] = 2; // RGB
  parts.push(chunk("IHDR", header));
  for (const [key, value] of Object.entries(tags)) {
    const body = new Uint8Array(key.length + 1 + encoder.encode(value).length);
    body.set(encoder.encode(key), 0);
    body[key.length] = 0;
    body.set(encoder.encode(value), key.length + 1);
    parts.push(chunk("tEXt", body));
  }
  // One scanline: filter byte 0 then three colour bytes, zlib-compressed.
  const raw = new Uint8Array([0, 0x40, 0x80, 0xc0]);
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
  positive: "1girl, silver hair, quiet library, warm afternoon light",
  negative: "blurry, low quality",
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

const savedPng = pngDataUrl({ comfy_pocket: JSON.stringify({ settings, version: 2 }) });

function answer(command: string, args: Record<string, unknown> | undefined) {
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
  if (command === "image") return savedPng;
  if (command === "save_image") return "";
  if (command === "update_action")
    return { supported: false, phase: "idle", available: false };
  if (command === "llm_get")
    return { base_url: "", model: "", temperature: 0.7, has_key: false };
  if (command === "api") {
    const path = (args?.path as string) ?? "";
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
          prompt: [{}, {}, {}, {}, {}],
          outputs: {
            "7": {
              images: [{ filename: "00042.png", subfolder: "", type: "output" }],
            },
          },
          status: { completed: true },
        },
      };
  }
  return {};
}

async function boot(page: Page) {
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
      JSON.stringify({
        model: "sd_xl_base_1.0.safetensors",
        sampler: "euler_ancestral",
        scheduler: "normal",
      }),
    );
  });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500);
}

test("the wardrobe can send a picked set to the scene description", async ({
  page,
}) => {
  await boot(page);
  await page.locator("aside nav button").nth(3).click();
  // Scene shelf → the bedroom set, then hand it to the prompt page.
  await page.locator(".theme-card").nth(1).click();
  const bedroom = page
    .locator(".glossary-tag")
    .filter({ has: page.locator("strong", { hasText: /^卧室$/ }) });
  await bedroom.click();
  await expect(page.locator(".glossary-selection")).toBeVisible();
  await page.locator(".describe-send").click();
  await page.waitForTimeout(600);
  // We land on the prompt page with the set written into the scene box.
  await expect(page.locator(".prompt-studio textarea").first()).toHaveValue(
    /卧室/,
  );
});

test("the image viewer shows the detailed prompt behind a picture", async ({
  page,
}) => {
  await boot(page);
  await page.locator("aside nav button").nth(2).click();
  // The grid renders a button only once the thumbnail has decoded.
  const shot = page.locator(".gallery-grid .image-button").first();
  await expect(shot).toBeVisible({ timeout: 15000 });
  await shot.scrollIntoViewIfNeeded();
  await shot.click();
  await page.waitForTimeout(900);
  const details = page.getByRole("button", { name: "查看详细提示词" });
  await expect(details).toBeVisible();
  await details.click();
  await expect(page.locator(".image-details")).toBeVisible();
  await expect(page.locator(".image-details .detail-text").first()).toContainText(
    "silver hair",
  );
  await expect(page.locator(".image-details .detail-rows")).toContainText(
    "anima.safetensors",
  );
  await expect(page.locator(".image-details .detail-rows")).toContainText(
    "detail_tweaker",
  );
});
