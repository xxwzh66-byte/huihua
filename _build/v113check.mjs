import { chromium } from "playwright";

const BASE = process.env.BASE || "http://127.0.0.1:14593";
const SHOT = "D:/demo/Paint-v1/_build/shot-v113.png";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 412, height: 900 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e).slice(0, 240)));
page.on("console", (m) => {
  if (m.type() === "error") errors.push("console: " + m.text().slice(0, 240));
});

await page.addInitScript(() => {
  localStorage.setItem("onboarding-done", "true");
  localStorage.setItem("mochi-language", "zh-CN");
  localStorage.removeItem("prompt-studio-history-v1");
});

let promptBody = null;
await page.route("**/__native", async (route) => {
  const body = route.request().postDataJSON() ?? {};
  const cmd = body.command ?? "";
  const args = body.args ?? {};
  let value = null;
  if (cmd === "restore") value = "http://127.0.0.1:8188";
  else if (cmd === "lock_status")
    value = { supported: false, available: false, enabled: false, unlocked: true };
  else if (cmd === "update_action")
    value = {
      supported: true,
      phase: "idle",
      received: 0,
      ready: false,
      available: false,
      canInstall: false,
      current: "1.1.3",
    };
  else if (cmd === "llm_get")
    value = {
      base_url: "http://127.0.0.1:9/v1",
      model: "mock-model",
      temperature: 0.7,
      has_key: true,
    };
  else if (cmd === "llm_chat")
    value = { content: "1girl, solo, rain, neon", model: "mock-model" };
  else if (cmd === "api") {
    const p = args.path || "";
    if (p === "/api/system_stats")
      value = {
        system: {
          os: "linux",
          ram_total: 68e9,
          ram_free: 40e9,
          comfyui_version: "0.3.40",
        },
        devices: [
          {
            name: "cuda:0 NVIDIA GeForce RTX 4070 SUPER : cudaMallocAsync",
            vram_total: 12e9,
            vram_free: 9e9,
          },
        ],
      };
    else if (p === "/api/object_info")
      value = {
        CheckpointLoaderSimple: {
          input: { required: { ckpt_name: [["sdxl.safetensors"]] } },
        },
        CLIPTextEncode: { input: { required: { text: ["STRING", {}] } } },
        KSampler: {
          input: {
            required: {
              seed: ["INT", {}],
              steps: ["INT", {}],
              cfg: ["FLOAT", {}],
              sampler_name: [["euler", "euler_ancestral", "dpmpp_2m"]],
              scheduler: [["normal", "karras"]],
            },
          },
        },
        EmptyLatentImage: {
          input: {
            required: {
              width: ["INT", {}],
              height: ["INT", {}],
              batch_size: ["INT", {}],
            },
          },
        },
      };
    else if (p === "/api/queue") value = { queue_running: [], queue_pending: [] };
    else if (p === "/api/prompt") {
      promptBody = args.body?.prompt ?? null;
      value = { prompt_id: "p1" };
    } else value = {};
  }
  await route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ ok: true, value }),
  });
});

await page.goto(BASE, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(5200);

console.log(
  "nav:",
  await page.locator(".sidebar nav button").allInnerTexts(),
);

const body = await page.locator("main").innerText().catch(() => "");
console.log("has 自动 segmented:", /Automatique|自动/.test(body));
console.log(
  "cards:",
  await page.locator(".atelier-layout > *").evaluateAll((els) =>
    els.map((e) => e.className || e.tagName).slice(0, 14),
  ),
);
console.log(
  "prompt section present:",
  await page.locator("#studio-prompts").isVisible().catch(() => false),
);
console.log(
  "render panel present:",
  await page.locator("#studio-render").isVisible().catch(() => false),
);
console.log(
  "settings grid present:",
  await page.locator(".settings-grid").count(),
);

// Workflow card.
const card = page.locator("#studio-workflow");
await card.locator("h2 button").click();
await page.waitForTimeout(500);
await card
  .locator('input[accept*="json"]')
  .setInputFiles("D:/demo/Paint-v1/_build/sample-workflow.json");
await page.waitForTimeout(1200);
console.log("canvas count:", await page.locator(".canvas-count").innerText().catch(() => "(none)"));
console.log(
  "bound chips:",
  await page.locator(".canvas-bindings .binding-chip").allInnerTexts(),
);

// Edit a bound value in the canvas.
const editor = page.locator(".node-bound textarea.bound-editor").first();
if (await editor.count()) {
  const before = await editor.inputValue();
  await editor.fill("a quiet lake at dawn");
  await page.waitForTimeout(400);
  console.log("bound editor", JSON.stringify(before), "->", await editor.inputValue());
  console.log("settings positive:", await page.evaluate(() => (JSON.parse(localStorage.getItem("settings") || "{}").positive || "").slice(0, 60)));
}

// Prompt card.
await page.locator("#studio-prompts .positive-entry").click();
await page.waitForTimeout(600);
console.log("editor opened:", await page.locator(".prompt-editor, dialog").count());
await page.keyboard.press("Escape");
await page.waitForTimeout(500);

// Generate.
await page.locator(".generate-bar button.primary").click();
await page.waitForTimeout(1800);
console.log("sent prompt text:", promptBody ? JSON.stringify(promptBody["2"]?.inputs?.text ?? "").slice(0, 90) : "(no prompt sent)");
console.log("sent has placeholder:", promptBody ? JSON.stringify(promptBody).includes("{{") : "n/a");

await page.screenshot({ path: SHOT, fullPage: true });
console.log("errors:", errors.length ? errors : "none");
await browser.close();
