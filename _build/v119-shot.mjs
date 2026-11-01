import { chromium } from "@playwright/test";
import { deflateSync } from "node:zlib";

/**
 * v1.19 visual check: the appearance picker, the five themes, the gallery and
 * the two-button result row.
 */

const info = {
  CheckpointLoaderSimple: {
    class_type: "CheckpointLoaderSimple",
    input: { required: { ckpt_name: [["sd_xl_base_1.0.safetensors"], {}] } },
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

/** 96x96 PNG, real pixels so the thumbnailer and the viewer both work. */
function pngDataUrl(side = 96) {
  const table = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();
  const crc = (bytes) => {
    let c = 0xffffffff;
    for (const b of bytes) c = table[(c ^ b) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const enc = new TextEncoder();
  const chunk = (type, data) => {
    const out = new Uint8Array(12 + data.length);
    const v = new DataView(out.buffer);
    v.setUint32(0, data.length);
    const body = new Uint8Array(4 + data.length);
    body.set(enc.encode(type), 0);
    body.set(data, 4);
    out.set(body, 4);
    v.setUint32(8 + data.length, crc(body));
    return out;
  };
  const parts = [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])];
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
    for (let x = 0; x < side; x++) {
      raw[row + 1 + x * 3] = 0x60 + ((x * 3) % 120);
      raw[row + 2 + x * 3] = 0x70 + ((y * 3) % 110);
      raw[row + 3 + x * 3] = 0x90 + (((x + y) * 2) % 90);
    }
  }
  return `data:image/png;base64,${Buffer.from(
    [].concat(...parts.map((p) => [...p]), [...chunk("IDAT", deflateSync(raw)), ...chunk("IEND", new Uint8Array(0))]),
  ).toString("base64")}`;
}

const savedPng = pngDataUrl();

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
  if (command === "image") return savedPng;
  if (command === "save_image") return "";
  if (command === "update_action")
    return { supported: false, phase: "idle", available: false };
  if (command === "llm_get")
    return { base_url: "", model: "", temperature: 0.7, has_key: false };
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
    if (path === "/api/prompt") return { prompt_id: "run-1" };
    if (path.startsWith("/api/history"))
      return {
        a: {
          outputs: { "7": { images: [{ filename: "00042.png", subfolder: "", type: "output" }] } },
          status: { completed: true },
        },
        b: {
          outputs: { "7": { images: [{ filename: "00041.png", subfolder: "", type: "output" }] } },
          status: { completed: true },
        },
        c: {
          outputs: { "7": { images: [{ filename: "00040.png", subfolder: "set", type: "output" }] } },
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
page.on("pageerror", (e) => console.log("pageerror:", e.message));

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
      positive: "1girl, silver hair, quiet library",
    }),
  );
});
await page.goto("http://127.0.0.1:14420/", { waitUntil: "domcontentloaded" });
await page.waitForSelector(".generate-bar", { timeout: 15000 });
await page.waitForTimeout(1200);

// The page window can sit over the nav during a transition, so click through DOM.
async function nav(index) {
  await page.evaluate((i) => {
    const buttons = document.querySelectorAll("aside nav button");
    const target = i < 0 ? buttons[buttons.length - 1] : buttons[i];
    if (target) target.click();
  }, index);
  await page.waitForTimeout(1100);
}

// Gallery with real thumbnails. Nav order: 0 atelier, 1 prompts, 2 gallery.
await nav(2);
await page.waitForTimeout(1500);
await page.screenshot({ path: "D:\\demo\\Paint-v1\\_build\\v119-gallery.png" });
console.log("gallery cells:", await page.locator(".gallery-card").count());
console.log(
  "broken cells:",
  await page.locator(".gallery-card .image-placeholder").count(),
);

// Settings -> Application -> appearance picker.
await nav(-1);
const groups = page.locator("details.settings-group");
const total = await groups.count();
console.log("groups:", total);
const last = groups.nth(total - 1);
console.log("last group:", (await last.locator("summary").innerText()).replace(/\s+/g, " "));
if (!(await last.evaluate((el) => el.hasAttribute("open")))) {
  await last.locator("summary").click();
  await page.waitForTimeout(500);
}
console.log("theme rows:", await page.locator(".theme-row").count());
await page.locator(".theme-row").scrollIntoViewIfNeeded();
await page.waitForTimeout(300);
await page.screenshot({ path: "D:\\demo\\Paint-v1\\_build\\v119-settings.png" });
await page.locator(".theme-row").click();
await page.waitForTimeout(500);
console.log("theme options:", await page.locator('.theme-options [role="radio"]').count());
await page.screenshot({ path: "D:\\demo\\Paint-v1\\_build\\v119-themes.png" });

async function openPicker() {
  await nav(-1);
  const list = page.locator("details.settings-group");
  const item = list.nth((await list.count()) - 1);
  if (!(await item.evaluate((el) => el.hasAttribute("open")))) {
    await item.locator("summary").click();
    await page.waitForTimeout(450);
  }
  await page.locator(".theme-row").scrollIntoViewIfNeeded();
  await page.waitForTimeout(250);
  await page.locator(".theme-row").click();
  await page.waitForTimeout(450);
}

// Each theme, on the Atelier page.
for (const [index, name] of ["pure", "warm", "mint", "ink", "night"].entries()) {
  if (!(await page.locator(".theme-options").isVisible())) await openPicker();
  await page.locator('.theme-options [role="radio"]').nth(index).click();
  await page.waitForTimeout(450);
  await nav(0);
  await page.waitForTimeout(900);
  await page.screenshot({ path: `D:\\demo\\Paint-v1\\_build\\v119-theme-${name}.png` });
}

console.log("theme now:", await page.evaluate(() => localStorage.getItem("mochi-theme")));
await browser.close();
