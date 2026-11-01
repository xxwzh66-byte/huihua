import { test, expect, type Page } from "@playwright/test";
import { deflateSync } from "node:zlib";

/**
 * v1.19 closes four gaps and answers one question:
 *  - gallery cells really render (the thumbnail pipeline used to fetch a
 *    `data:` URL, which the CSP `connect-src` list blocked outright),
 *  - the result panel offers exactly two actions, favourite and delete,
 *  - the language row is a static 简体中文 line, no picker left,
 *  - appearance is a real picker over five themes and the choice persists.
 * The live-preview fix (cleartext for release builds) is Gradle-side, so it is
 * covered by the APK checklist rather than by a browser test.
 */

const info = {
  CheckpointLoaderSimple: {
    class_type: "CheckpointLoaderSimple",
    input: {
      required: { ckpt_name: [["sd_xl_base_1.0.safetensors"], {}] },
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
        sampler_name: [["euler_ancestral"], {}],
        scheduler: [["normal"], {}],
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

/** A real 64x64 PNG so the thumbnail canvas has something to downscale. */
function pngDataUrl(side = 64): string {
  const parts: Uint8Array[] = [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])];
  const header = new Uint8Array(13);
  const hv = new DataView(header.buffer);
  hv.setUint32(0, side);
  hv.setUint32(4, side);
  header[8] = 8;
  header[9] = 2;
  parts.push(chunk("IHDR", header));
  const raw = new Uint8Array(side * (side * 3 + 1));
  for (let y = 0; y < side; y++) {
    const row = y * (side * 3 + 1);
    raw[row] = 0;
    for (let x = 0; x < side; x++) {
      raw[row + 1 + x * 3] = 0x40;
      raw[row + 2 + x * 3] = 0x80;
      raw[row + 3 + x * 3] = 0xc0;
    }
  }
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

const savedPng = pngDataUrl();

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
    if (path === "/api/prompt") return { prompt_id: "run-1" };
    if (path.startsWith("/api/history"))
      return {
        done: {
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

const SERVER = "http://192.168.1.8:8188";

async function boot(page: Page) {
  await page.route("**/__native", async (route) => {
    const body = JSON.parse(route.request().postData() || "{}");
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ value: answer(body.command, body.args) }),
    });
  });
  await page.addInitScript((server) => {
    // Seed once: a reload must be able to read back what the app just wrote.
    if (!sessionStorage.getItem("v119-seeded")) {
      sessionStorage.setItem("v119-seeded", "1");
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
      // One finished render, so the result panel has something to act on.
      localStorage.setItem(
        "results:" + server,
        JSON.stringify([
          {
            path: "/api/view?filename=00042.png&subfolder=&type=output",
            name: "00042.png",
          },
        ]),
      );
    }
  }, SERVER);
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".generate-bar", { timeout: 15000 });
  await page.waitForTimeout(600);
}

async function openSettings(page: Page) {
  await page.locator("aside nav button").last().click();
  await page.waitForTimeout(800);
  const groups = page.locator("details.settings-group");
  const group = groups.nth((await groups.count()) - 1);
  await group.locator("summary").click();
  await page.waitForTimeout(300);
  return group;
}

test("the gallery paints every cell through the local thumbnailer", async ({
  page,
}) => {
  await boot(page);
  await page.locator("aside nav button").nth(3).click();
  await page.waitForTimeout(1500);

  const cells = page.locator(".gallery-card");
  await expect(cells.first()).toBeVisible({ timeout: 10000 });
  const image = page.locator(".gallery-card img").first();
  await expect(image).toBeVisible({ timeout: 10000 });
  // The cell must show a decoded bitmap, not the "Image indisponible" fallback.
  await expect
    .poll(async () => image.evaluate((node: HTMLImageElement) => node.naturalWidth))
    .toBeGreaterThan(0);
  await expect(page.locator(".gallery-card .image-placeholder")).toHaveCount(0);
});

test("the result panel offers only favourite and delete", async ({ page }) => {
  await boot(page);
  // Loading a page with history fills the result strip and the hero action row.
  const actions = page.locator(".result-actions");
  await expect(actions).toBeVisible({ timeout: 10000 });
  const labels = await actions.locator("button").evaluateAll((nodes) =>
    nodes.map((node) => node.getAttribute("aria-label") ?? ""),
  );
  expect(labels).toEqual(["收藏此结果", "删除此结果"]);
  // v1.19 dropped the third button ("hide this result"); two remain, no more.
  await expect(actions.locator("button")).toHaveCount(2);
});

test("the language row is fixed and the appearance picker persists a theme", async ({
  page,
}) => {
  await boot(page);
  const group = await openSettings(page);

  // Language: one static row, no radiogroup left anywhere.
  await expect(group.locator(".language-setting")).toContainText("简体中文");
  await expect(page.locator('[role="radiogroup"]')).toHaveCount(0);

  // Appearance: five themes, the chosen one lands in localStorage + data-theme.
  await group.locator(".theme-row").click();
  await page.waitForTimeout(300);
  const options = page.locator('.theme-options [role="radio"]');
  await expect(options).toHaveCount(5);
  await options.nth(4).click();
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => localStorage.getItem("mochi-theme"))).toBe(
    "night",
  );
  expect(
    await page.evaluate(() => document.documentElement.dataset.theme),
  ).toBe("night");

  // Reload keeps it: the choice is read before the first paint.
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector(".generate-bar", { timeout: 15000 });
  expect(
    await page.evaluate(() => document.documentElement.dataset.theme),
  ).toBe("night");
});
