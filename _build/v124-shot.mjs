import { chromium } from "@playwright/test";
import { deflateSync } from "node:zlib";

const info = {
  CheckpointLoaderSimple: {
    class_type: "CheckpointLoaderSimple",
    input: { required: { ckpt_name: [["sd_xl_base_1.0.safetensors"], {}] } },
  },
  CLIPTextEncode: {
    class_type: "CLIPTextEncode",
    input: { required: { text: ["STRING", { multiline: true }], clip: ["CLIP", {}] } },
  },
  KSampler: {
    class_type: "KSampler",
    input: {
      required: {
        model: ["MODEL", {}],
        seed: ["INT", {}],
        steps: ["INT", {}],
        cfg: ["FLOAT", {}],
        sampler_name: [["euler_ancestral"], {}],
        scheduler: [["normal"], {}],
        positive: ["CONDITIONING", {}],
        negative: ["CONDITIONING", {}],
        latent_image: ["LATENT", {}],
        denoise: ["FLOAT", {}],
      },
    },
  },
};

const SERVER = "http://192.168.1.8:8188";
const OUT = "D:/demo/Paint-v1/_build";

function answer(command, args) {
  if (command === "lock_status")
    return { supported: false, available: false, enabled: false, unlocked: true };
  if (command === "restore") return SERVER;
  if (command === "image" || command === "save_image") return "";
  if (command === "open_link") return { opened: true };
  if (command === "update_action")
    return {
      supported: true,
      phase: "idle",
      error: "",
      received: 0,
      ready: false,
      available: true,
      canInstall: true,
      release: {
        version: "9.9.9",
        size: 75253503,
        title: "绘画 9.9.9",
        published: "2026-11-05T04:13:06Z",
        page: "https://github.com/xxwzh66-byte/huihua/releases/tag/v9.9.9",
        notes: "## 更快\n- 更新下载改成分片并行，同样的网络快十几倍\n- 设置页多了项目入口",
      },
    };
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
    if (path.startsWith("/api/history")) return {};
  }
  return {};
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
await page.route("**/__native", async (route) => {
  const body = JSON.parse(route.request().postData() || "{}");
  await route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({ value: answer(body.command, body.args) }),
  });
});
await page.addInitScript((server) => {
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
  localStorage.setItem("server", server);
}, SERVER);

await page.goto("http://127.0.0.1:14420/", { waitUntil: "domcontentloaded" });
await page.waitForSelector(".generate-bar", { timeout: 15000 });
await page.waitForTimeout(500);

await page.evaluate(() => {
  const buttons = document.querySelectorAll("aside nav button");
  buttons[buttons.length - 1]?.click();
});
await page.waitForTimeout(900);
const groups = page.locator("details.settings-group");
const group = groups.nth((await groups.count()) - 1);
await group.locator("summary").click();
await page.waitForTimeout(400);

const row = group.locator(".project-link > button");
await row.scrollIntoViewIfNeeded();
await page.waitForTimeout(300);
await page.screenshot({ path: `${OUT}/v124-settings.png`, fullPage: true });
console.log("row text:", (await row.innerText()).replace(/\n/g, " | "));

await page.evaluate(() => window.dispatchEvent(new Event("mochi-update")));
await page.waitForTimeout(1400);
const dialog = page.locator("dialog.update-dialog");
console.log("dialog open:", await dialog.isVisible());
console.log("release links:", await dialog.locator("a").count());
await page.screenshot({ path: `${OUT}/v124-update.png` });

await browser.close();
