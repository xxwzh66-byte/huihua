import { chromium } from "playwright";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 412, height: 900 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
});
await page.addInitScript(() => {
  localStorage.setItem("onboarding-done", "true");
  localStorage.setItem("mochi-language", "zh-CN");
  localStorage.setItem("mochi-update-auto", "false");
});
await page.route("**/__native", async (route) => {
  const { command, args } = route.request().postDataJSON();
  let value = null;
  if (command === "lock_status")
    value = { supported: false, available: false, enabled: false, unlocked: true };
  else if (command === "restore") value = "http://192.168.1.8:8188";
  else if (command === "llm_get")
    value = { base_url: "https://api.deepseek.com", model: "deepseek-chat", temperature: 0.7, has_key: true };
  else if (command === "llm_chat")
    value = { content: "1girl, solo, tokyo street, rain, pink neon, wet asphalt, reflection", model: "deepseek-chat" };
  else if (command === "update_action")
    value = { supported: false, phase: "idle", received: 0, ready: false, available: false, canInstall: false };
  else if (command === "api") {
    const path = String(args?.path ?? "");
    if (path.startsWith("/api/system_stats"))
      value = {
        system: { os: "linux", python_version: "3.11", comfyui_version: "0.3.30" },
        devices: [{ name: "cuda:0 NVIDIA GeForce RTX 4070 SUPER", type: "cuda", vram_total: 25757220864, vram_free: 9663676416, torch_vram_total: 0, torch_vram_free: 0 }],
      };
    else if (path.startsWith("/api/object_info"))
      value = {
        CheckpointLoaderSimple: { input: { required: { ckpt_name: [["sdxl.safetensors"], {}] } } },
        CLIPTextEncode: { input: { required: { text: ["STRING", {}], clip: ["CLIP", {}] } } },
      };
    else if (path.startsWith("/api/queue")) value = { queue_running: [], queue_pending: [] };
    else value = {};
  }
  await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ value }) });
});

await page.goto("http://127.0.0.1:14566/", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(4300);
await page.locator('button[aria-label="你的创意"]').first().click({ force: true });
await page.waitForTimeout(1000);
await page.locator('.voice-entry').first().click({ force: true });
await page.waitForTimeout(1200);
const quick = await page.locator(".assistant-quick").count();
console.log("assistant-quick sections:", quick);
if (quick) {
  console.log("text:", (await page.locator(".assistant-quick").first().innerText()).replace(/\n+/g, " | "));
  await page.locator(".assistant-quick textarea").first().fill("雨中的东京街头，粉色霓虹");
  await page.locator('.assistant-quick button:has-text("生成提示词")').first().click();
  await page.waitForTimeout(1500);
  const out = await page.locator(".assistant-output pre").first().innerText().catch(() => "none");
  console.log("output:", out);
  console.log("copy button:", await page.locator(".assistant-copy").first().innerText().catch(() => "none"));
  await page.locator(".assistant-copy").first().click();
  await page.waitForTimeout(600);
  console.log("copy label after click:", await page.locator(".assistant-copy").first().innerText());
  await page.screenshot({ path: "D:/demo/Paint-v1/_build/shot-v111-assistant.png" });
}
console.log("errors:", errors.length, errors.slice(0, 4));
await browser.close();
