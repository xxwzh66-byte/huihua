import { chromium } from "playwright";

const BASE = process.env.BASE || "http://127.0.0.1:14593";
const SHOT = "D:/demo/Paint-v1/_build/shot-v113-gen.png";

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
        system: { os: "linux", ram_total: 68e9, ram_free: 40e9, comfyui_version: "0.3.40" },
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
        VAEDecode: { input: { required: { samples: ["LATENT", {}], vae: ["VAE", {}] } } },
        SaveImage: {
          input: {
            required: {
              images: ["IMAGE", {}],
              filename_prefix: ["STRING", {}],
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

// Import the sample workflow.
const card = page.locator("#studio-workflow");
await card.locator("h2 button").click();
await page.waitForTimeout(400);
await card
  .locator('input[accept*="json"]')
  .setInputFiles("D:/demo/Paint-v1/_build/sample-workflow.json");
await page.waitForTimeout(1200);

// The prompt bound field is the first textarea inside a node card.
const boundText = page.locator(".node-bound textarea.bound-editor").first();
console.log("bound textarea count:", await page.locator(".node-bound textarea.bound-editor").count());
console.log("bound value before:", JSON.stringify(await boundText.inputValue()));
await boundText.fill("a quiet lake at dawn");
await page.waitForTimeout(500);
console.log(
  "settings.positive:",
  await page.evaluate(
    () => (JSON.parse(localStorage.getItem("settings") || "{}").positive || "").slice(0, 60),
  ),
);

// Generate.
console.log("gen disabled:", await page.locator(".generate-bar button.primary").isDisabled());
await page.locator(".generate-bar button.primary").click();
await page.waitForTimeout(2000);
console.log(
  "sent text node 2:",
  promptBody ? JSON.stringify(String(promptBody["2"]?.inputs?.text ?? "")).slice(0, 80) : "(none)",
);
console.log("placeholders left:", promptBody ? JSON.stringify(promptBody).includes("{{") : "n/a");
console.log("raw sent:", promptBody ? Object.keys(promptBody).join(",") : "(none)");
console.log("toast:", await page.locator(".toast-stack").innerText().catch(() => "(none)"));

await page.screenshot({ path: SHOT, fullPage: true });
console.log("errors:", errors.length ? errors : "none");
await browser.close();
