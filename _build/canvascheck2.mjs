import { chromium } from "playwright";

const base = "http://127.0.0.1:14555";

const info = {
  CheckpointLoaderSimple: { input: { required: { ckpt_name: [["sdxl.safetensors", "anima.safetensors"]] } } },
  CLIPTextEncode: { input: { required: { text: ["STRING", { multiline: true }], clip: ["CLIP"] } } },
  EmptyLatentImage: { input: { required: { width: ["INT"], height: ["INT"], batch_size: ["INT"] } } },
  KSampler: {
    input: {
      required: {
        model: ["MODEL"], seed: ["INT"], steps: ["INT"], cfg: ["FLOAT"],
        sampler_name: [["euler", "euler_ancestral"]], scheduler: [["normal", "karras"]],
        positive: ["CONDITIONING"], negative: ["CONDITIONING"], latent_image: ["LATENT"], denoise: ["FLOAT"],
      },
    },
  },
  VAEDecode: { input: { required: { samples: ["LATENT"], vae: ["VAE"] } } },
  SaveImage: { input: { required: { images: ["IMAGE"], filename_prefix: ["STRING"] } } },
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 412, height: 900 } });
page.setDefaultTimeout(20000);
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
await page.addInitScript(() => {
  localStorage.setItem("onboarding-done", "true");
  localStorage.setItem("mochi-language", "zh-CN");
});
await page.route("**/__native", async (route) => {
  const { command, args } = route.request().postDataJSON();
  let value = {};
  if (command === "restore") value = "http://127.0.0.1:8188";
  if (command === "lock_status") value = { supported: false, available: false, enabled: false, unlocked: true };
  if (command === "update_action")
    value = { supported: true, phase: "idle", received: 0, ready: false, available: false, canInstall: true };
  if (command === "api") {
    const p = String(args.path ?? "");
    if (p === "/api/system_stats")
      value = { system: { ram_total: 68719476736, ram_free: 34359738368 }, devices: [{ name: "RTX 4070 SUPER", vram_total: 12884901888, vram_free: 9663676416 }] };
    else if (p === "/api/object_info") value = info;
    else if (p === "/api/queue") value = { queue_running: [], queue_pending: [] };
  }
  await route.fulfill({ json: { value } });
});
await page.goto(base, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(4000);

await page.locator(".studio-imports .segmented button").nth(1).click();
await page.waitForTimeout(800);
await page.screenshot({ path: "D:/demo/Paint-v1/_build/shot-workflow-mode.png" });

await page.locator('input[accept*="json"]').first().setInputFiles("D:/demo/Paint-v1/_build/sample-workflow.json");
await page.waitForTimeout(1500);
await page.locator(".studio-prompt-card summary, details summary").first().click().catch(() => {});
await page.waitForTimeout(600);
await page.evaluate(() => document.querySelectorAll("details").forEach((d) => { if (/API/.test(d.innerText)) d.open = true; }));
await page.waitForTimeout(900);
await page.locator(".workflow-canvas").first().scrollIntoViewIfNeeded().catch(() => {});
await page.evaluate(() => { const c = document.querySelector(".workflow-canvas"); const card = c && c.closest(".collapsible-card"); if (!card) return "noc"; const head = card.querySelector("header button, .card-header button, button"); if (head) head.click(); return "clicked"; }).then((r) => console.log("open card:", r)); await page.waitForTimeout(900); const bx = await page.evaluate(() => { const c = document.querySelector(".workflow-canvas"); const r = c.getBoundingClientRect(); return { w: r.width, h: r.height, y: r.y }; }); console.log("canvas box", JSON.stringify(bx)); await page.locator(".workflow-canvas").scrollIntoViewIfNeeded(); await page.waitForTimeout(500); await page.screenshot({ path: "D:/demo/Paint-v1/_build/shot-canvas.png" });
console.log("canvas nodes:", await page.locator(".workflow-canvas [class*=node], .canvas-node").count());
console.log("canvas inner:", (await page.locator(".workflow-canvas").first().innerText().catch(() => "no .workflow-canvas")).slice(0, 300).replace(/\\n/g, " | "));

const canvas = page.locator("#studio-render");
console.log("render:", (await canvas.innerText()).slice(0, 400).replace(/\n/g, " | "));
console.log("errors:", errors.length ? errors.slice(0, 5) : "none");
await browser.close();
