import { test, expect, type Page } from "@playwright/test";

/**
 * v1.15 covers four user-facing promises:
 *  - the app opens straight into the Atelier, with no five-step onboarding,
 *  - the old glossary is now a wardrobe library built from the Anima presets,
 *  - the prompt editor lost the voice assistant, the autocomplete switch, the
 *    offline Danbooru bubble and the "check" tool,
 *  - a fresh import is never rewired to the automatic settings behind the
 *    user's back.
 * Everything runs against a mocked native bridge, so no ComfyUI is required.
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

/** A workflow with no placeholder at all: importing it must not add any. */
const plain = {
  "1": {
    class_type: "CheckpointLoaderSimple",
    inputs: { ckpt_name: "sd_xl_base_1.0.safetensors" },
  },
  "2": { class_type: "CLIPTextEncode", inputs: { text: "a quiet library", clip: ["1", 1] } },
  "3": { class_type: "CLIPTextEncode", inputs: { text: "blurry", clip: ["1", 1] } },
  "4": { class_type: "EmptyLatentImage", inputs: { width: 1024, height: 1024, batch_size: 1 } },
  "5": {
    class_type: "KSampler",
    inputs: {
      model: ["1", 0],
      seed: 42,
      steps: 30,
      cfg: 5,
      sampler_name: "euler_ancestral",
      scheduler: "normal",
      positive: ["2", 0],
      negative: ["3", 0],
      latent_image: ["4", 0],
      denoise: 1,
    },
  },
  "6": { class_type: "VAEDecode", inputs: { samples: ["5", 0], vae: ["1", 2] } },
  "7": {
    class_type: "SaveImage",
    inputs: { images: ["6", 0], filename_prefix: "ComfyPocket/ComfyPocket" },
  },
};

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
  if (command === "image" || command === "save_image") return "";
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
    if (path.startsWith("/api/history")) return {};
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
  // A brand-new install: no onboarding flag, nothing but the language choice.
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

test("a fresh install lands in the Atelier, with no onboarding steps", async ({
  page,
}) => {
  await boot(page);
  // The walkthrough is gone: no step counter, no "later" button, no wizard.
  await expect(page.locator(".setup-mobile-resume")).toHaveCount(0);
  await expect(page.locator("text=欢迎使用")).toHaveCount(0);
  await expect(page.locator("text=快速上手")).toHaveCount(0);
  // The app itself is right there, with all five destinations.
  await expect(page.locator("aside nav button")).toHaveCount(5);
  await expect(page.locator("aside nav button").nth(3)).toContainText("素材库");
});

test("the wardrobe offers four shelves, searches and feeds the prompt", async ({
  page,
}) => {
  await boot(page);
  await page.locator("aside nav button").nth(3).click();
  await expect(page.locator(".theme-card strong")).toHaveText([
    "服装",
    "场景",
    "姿势",
    "表情",
  ]);

  // Scene shelf: private rooms first, and a bedroom set is selectable.
  await page.locator(".theme-card").nth(1).click();
  await expect(page.locator(".theme-choices button")).toHaveCount(7);
  const bedroom = page
    .locator(".glossary-tag")
    .filter({ has: page.locator("strong", { hasText: /^卧室$/ }) });
  await bedroom.locator("button, span").first().click().catch(async () => {
    await bedroom.click();
  });
  await expect(page.locator(".glossary-selection")).toBeVisible();
  await expect(page.locator(".selected-tags button")).toContainText(["bedroom"]);

  // "Positif" writes the tags into the Atelier prompt.
  await page.locator(".glossary-selection .primary").click();
  await page.waitForTimeout(300);
  await page.locator("aside nav button").nth(0).click();
  await page.waitForTimeout(500);
  await expect(page.locator(".prompt-entry.positive-entry")).toContainText(
    "bedroom",
  );
});

test("the prompt editor keeps only text, blocks, translation and weights", async ({
  page,
}) => {
  await boot(page);
  const entry = page.locator(".prompt-entry").first();
  await entry.scrollIntoViewIfNeeded();
  await entry.click();
  await expect(page.locator(".prompt-editor textarea")).toBeVisible();
  // Gone in v1.15: voice assistant, autocomplete switch, Danbooru bubble.
  await expect(page.locator(".voice-entry")).toHaveCount(0);
  await expect(page.locator(".autocomplete-setting")).toHaveCount(0);
  await expect(page.locator(".suggestion-bubble")).toHaveCount(0);
  // Typing a tag prefix no longer opens a suggestion list.
  await page.locator(".prompt-editor textarea").fill("landsc");
  await page.waitForTimeout(600);
  await expect(page.locator(".suggestion-bubble")).toHaveCount(0);
  // The tools row is down from three entries to two: no "check" page.
  await expect(page.locator(".prompt-tools button")).toHaveCount(2);
  await expect(page.locator(".prompt-tools button").nth(1)).toContainText("区块");
});

test("importing a workflow leaves its fields untouched", async ({ page }) => {
  await boot(page);
  // Open the "API 工作流" card, which holds the importer.
  const card = page
    .locator(".collapsible-card")
    .filter({ has: page.locator(".card-heading", { hasText: "API 工作流" }) });
  await card.locator(".card-heading button").click();
  await page.waitForTimeout(300);
  await card
    .locator('label.file-picker input[type="file"]')
    .setInputFiles({
      name: "plain.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify({ prompt: plain })),
    });
  await page.waitForTimeout(600);
  // v1.15: no autoBind on import → the JSON view still holds the literal text.
  await card.locator(".segmented button").filter({ hasText: "JSON" }).click();
  const editor = page.locator("textarea.code-editor");
  await expect(editor).toHaveValue(/"text": "a quiet library"/);
  await expect(editor).not.toHaveValue(/\{\{prompt\}\}/);
});
