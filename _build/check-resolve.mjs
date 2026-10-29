import { chromium } from "playwright";

const GRAPH = {
  prompt: {
    "1": { class_type: "CheckpointLoaderSimple", inputs: { ckpt_name: "{{model}}" } },
    "2": { class_type: "CLIPTextEncode", inputs: { text: "{{prompt}}", clip: ["1", 1] } },
    "5": {
      class_type: "KSampler",
      inputs: {
        seed: "{{seed}}",
        steps: "{{steps}}",
        cfg: "{{cfg}}",
        sampler_name: "{{sampler}}",
        scheduler: "{{scheduler}}",
        denoise: 1,
        model: ["1", 0],
        positive: ["2", 0],
        negative: ["2", 0],
        latent_image: ["1", 0],
      },
    },
    "7": { class_type: "PreviewImage", inputs: { images: ["5", 0] } },
  },
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 412, height: 900 } });
const posted = [];
const paths = [];
await page.addInitScript(() => {
  localStorage.setItem("onboarding-done", "true");
  localStorage.setItem("mochi-language", "zh-CN");
  localStorage.setItem("workflow-library-v1", "[]");
});
await page.route("**/__native", async (route) => {
  const { command, args } = route.request().postDataJSON();
  let value = null;
  if (command === "lock_status")
    value = { supported: false, available: false, enabled: false, unlocked: true };
  else if (command === "restore") value = "http://192.168.1.8:8188";
  else if (command === "llm_get") value = { base_url: "", model: "", temperature: 0.7, has_key: false };
  else if (command === "update_action")
    value = { supported: false, phase: "idle", received: 0, ready: false, available: false, canInstall: false };
  else if (command === "api") {
    const path = String(args?.path ?? "");
    paths.push(path + (args?.body ? " BODY" : ""));
    if (path.startsWith("/api/system_stats"))
      value = {
        system: { os: "linux", python_version: "3.11", comfyui_version: "0.3.30" },
        devices: [{ name: "cuda:0 NVIDIA GeForce RTX 4070 SUPER", type: "cuda", vram_total: 1, vram_free: 1, torch_vram_total: 0, torch_vram_free: 0 }],
      };
    else if (path.startsWith("/api/object_info"))
      value = {
        CheckpointLoaderSimple: { input: { required: { ckpt_name: [["sdxl.safetensors"], {}] } } },
        CLIPTextEncode: { input: { required: { text: ["STRING", {}], clip: ["CLIP", {}] } } },
        KSampler: {
          input: {
            required: {
              seed: ["INT", {}], steps: ["INT", {}], cfg: ["FLOAT", {}],
              sampler_name: [["euler"], {}], scheduler: [["normal"], {}],
              denoise: ["FLOAT", {}], model: ["MODEL", {}], positive: ["CONDITIONING", {}],
              negative: ["CONDITIONING", {}], latent_image: ["LATENT", {}],
            },
          },
        },
        PreviewImage: { input: { required: { images: ["IMAGE", {}] } } },
      };
    else if (path.startsWith("/api/queue")) value = { queue_running: [], queue_pending: [] };
    else if (path.startsWith("/api/history")) value = {};
    else value = {};
    if (path.startsWith("/api/prompt")) posted.push(args.body);
  }
  await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ value }) });
});

await page.goto("http://127.0.0.1:14566/", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(4300);

// type a prompt in the simple editor through the block editor
await page.locator('button[aria-label="你的创意"]').first().click({ force: true });
await page.waitForTimeout(900);
await page.locator(".prompt-editor textarea").first().fill("a quiet lake at dawn");
await page.locator('.prompt-editor button[aria-label="关闭"], .prompt-editor button[aria-label="Fermer"]').first().click({ force: true }).catch(() => {});
await page.waitForTimeout(800);
console.log("dialog open:", await page.locator("dialog[open]").count());

// switch to workflow mode and import
await page.locator(".studio-imports .segmented button").nth(1).click();
await page.waitForTimeout(700);
await page.locator(".collapsible-card h2 button").first().click();
await page.waitForTimeout(600);
await page.setInputFiles('input[accept*="json"]', {
  name: "wf.json",
  mimeType: "application/json",
  buffer: Buffer.from(JSON.stringify(GRAPH)),
});
await page.waitForTimeout(1200);
console.log("count:", await page.locator(".canvas-count").first().innerText());

const gen = page.locator('button:has-text("生成图像")').first();
console.log("gen count:", await page.locator('button:has-text("生成图像")').count(), "disabled:", await gen.isDisabled());
await gen.scrollIntoViewIfNeeded();
await gen.click();
await page.waitForTimeout(2500);
const toast = await page.locator(".toast-stack").innerText().catch(() => "none");
console.log("toast:", toast.replace(/\n+/g, " | ").slice(0, 300));
console.log("paths:", JSON.stringify(paths.slice(-8)));
console.log("posted:", posted.length ? JSON.stringify(posted[0].prompt["2"].inputs.text) : "none");
if (posted.length) {
  const p = posted[0].prompt;
  console.log("sampler:", JSON.stringify(p["5"].inputs.sampler_name), "steps:", JSON.stringify(p["5"].inputs.steps), "model:", JSON.stringify(p["1"].inputs.ckpt_name));
  console.log("leftover placeholder:", JSON.stringify(posted[0].prompt).includes("{{"));
}
await browser.close();
