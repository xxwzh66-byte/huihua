import { chromium } from "playwright";

const PORT = process.env.PAINT_TEST_PORT || "14420";
const BASE = `http://127.0.0.1:${PORT}`;
const OUT = "D:/demo/Paint-v1/_build/";

const info = {
  CheckpointLoaderSimple: {
    class_type: "CheckpointLoaderSimple",
    input: { required: { ckpt_name: [["sd_xl_base_1.0.safetensors"], {}] } },
  },
  CLIPTextEncode: {
    class_type: "CLIPTextEncode",
    input: {
      required: { text: ["STRING", { multiline: true }], clip: ["CLIP", {}] },
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
};

const SERVER = "http://192.168.1.8:8188";

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
  if (command === "restore") return SERVER;
  if (command === "image" || command === "save_image") return "";
  if (command === "update_action")
    return { supported: false, phase: "idle", available: false };
  if (command === "llm_get")
    return {
      base_url: "https://api.example.com/v1",
      model: "gpt-4o-mini",
      temperature: 0.7,
      has_key: true,
    };
  if (command === "llm_chat")
    return {
      content: "```\nsilver hair, quiet library, warm afternoon light\n```",
      model: "gpt-4o-mini",
    };
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
    if (path.startsWith("/api/history")) return {};
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
    JSON.stringify({
      model: "sd_xl_base_1.0.safetensors",
      sampler: "euler_ancestral",
      scheduler: "normal",
      positive: "银发少女，安静的旧图书馆，午后的暖光",
    }),
  );
  localStorage.setItem(
    "prompt-templates-v1",
    JSON.stringify([
      {
        id: "t1",
        name: "人像 · 电影感",
        description: "半身人像，柔和侧光",
        systemPrompt: "You write Danbooru tags for portraits.",
        params: [],
        body: "portrait of {{who}}",
        at: Date.now(),
      },
      {
        id: "t2",
        name: "场景 · 氛围",
        description: "",
        systemPrompt: "You write Danbooru tags for scenes.",
        params: [],
        body: "scene of {{what}}",
        at: Date.now(),
      },
    ]),
  );
  localStorage.setItem(
    "prompt-studio-history-v1",
    JSON.stringify([
      { id: "e1", input: "雨夜的东京街头", output: "rainy tokyo street, neon signs", at: Date.now() },
      { id: "e2", input: "雪山日出", output: "snow mountain, sunrise, mist", at: Date.now() - 60000 },
    ]),
  );
});

await page.goto(BASE, { waitUntil: "domcontentloaded" });
await page.waitForSelector(".generate-bar", { timeout: 20000 });
await page.waitForTimeout(800);

// 1) the Atelier shortcut for translating the whole prompt
await page.screenshot({ path: OUT + "v121-studio.png", fullPage: false });

const shortcut = page.locator('.prompt-shortcuts button[aria-label="翻译提示词"]');
await shortcut.scrollIntoViewIfNeeded();
await shortcut.click();
await page.waitForTimeout(500);
await page.locator(".translation-engine select").selectOption("api");
await page.locator('dialog.translation-dialog button:has-text("翻译")').last().click();
await page.waitForTimeout(1200);
await page.screenshot({ path: OUT + "v121-translate.png" });
await page.locator('dialog.translation-dialog button:has-text("插入到提示词")').click();
await page.waitForTimeout(400);

// 2) the prompt page: folded template block + folded history
await page.evaluate(() => {
  const buttons = document.querySelectorAll("aside nav button");
  buttons[1]?.click();
});
await page.waitForTimeout(900);
await page.screenshot({ path: OUT + "v121-prompt-folded.png", fullPage: true });

const card = page
  .locator(".collapsible-card")
  .filter({ has: page.locator(".card-heading", { hasText: "提示词模板" }) });
await card.locator(".card-heading button").click();
await page.waitForTimeout(400);
await page.screenshot({ path: OUT + "v121-template-open.png", fullPage: false });

await card.locator('button:has-text("管理")').click();
await page.waitForTimeout(600);
await page.screenshot({ path: OUT + "v121-template-manager.png" });

console.log("rows:", await page.locator("dialog.template-manager .template-list li").count());
console.log("shortcut visible:", await shortcut.isVisible());

await browser.close();
