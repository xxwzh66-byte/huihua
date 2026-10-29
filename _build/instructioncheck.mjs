import { chromium } from "playwright";

const BASE = process.env.BASE || "http://127.0.0.1:14591";
const SHOT = "D:/demo/Paint-v1/_build/shot-instruction.png";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 412, height: 900 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e).slice(0, 220)));
page.on("console", (m) => {
  if (m.type() === "error") errors.push("console: " + m.text().slice(0, 220));
});

await page.addInitScript(() => {
  localStorage.setItem("onboarding-done", "true");
  localStorage.setItem("mochi-language", "zh-CN");
  localStorage.removeItem("prompt-studio-history-v1");
  localStorage.removeItem("prompt-default-system-v1");
  localStorage.removeItem("prompt-templates-v1");
});

let sentSystem = null;
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
      current: "1.1.1",
    };
  else if (cmd === "llm_get")
    value = {
      base_url: "http://127.0.0.1:9/v1",
      model: "mock-model",
      temperature: 0.7,
      has_key: true,
    };
  else if (cmd === "llm_chat") {
    const messages = args.messages ?? [];
    sentSystem = (messages.find((m) => m.role === "system") || {}).content ?? "";
    value = { content: "1girl, solo, rain, neon", model: "mock-model" };
  } else if (cmd === "api") {
    const p = args.path || "";
    if (p === "/api/system_stats")
      value = {
        system: { os: "linux", ram_total: 68e9, ram_free: 40e9, comfyui_version: "0.3.40" },
        devices: [{ name: "cuda:0 NVIDIA GeForce RTX 4070 SUPER : cudaMallocAsync", vram_total: 12e9, vram_free: 9e9 }],
      };
    else if (p === "/api/object_info") value = {};
    else if (p === "/api/queue") value = { queue_running: [], queue_pending: [] };
    else value = {};
  }
  await route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ ok: true, value }),
  });
});

await page.goto(BASE, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(5000);
await page.locator(".sidebar nav button").nth(1).click();
await page.waitForTimeout(1000);

// Open the instruction editor.
await page.locator(".studio-instruction-toggle").click();
await page.waitForTimeout(500);
console.log(
  "editor visible:",
  await page.locator(".instruction-editor").isVisible(),
);
const defaultText = await page.locator(".instruction-field textarea").first().inputValue();
console.log("default instruction:", defaultText.slice(0, 80));

const preview = await page.locator(".instruction-preview pre").first().innerText();
console.log("preview:", preview.slice(0, 90));

// Edit + save.
await page.locator(".instruction-field textarea").first().fill("CUSTOM: write 5 danbooru tags only.");
await page.locator('.instruction-actions button:has-text("保存")').click();
await page.waitForTimeout(600);
console.log(
  "stored default:",
  await page.evaluate(() =>
    (localStorage.getItem("prompt-default-system-v1") || "(none)").slice(0, 80),
  ),
);
const notice = await page.locator(".studio-notice").innerText().catch(() => "(no notice)");
console.log("notice:", notice.trim());

// Generate and inspect what was actually sent.
await page.locator(".prompt-studio .studio-field textarea").fill("rainy street");
await page.locator(".prompt-studio .studio-actions button.primary").first().click();
await page.waitForTimeout(1500);
console.log("sent system:", (sentSystem || "(none)").slice(0, 80));
await page.screenshot({ path: SHOT, fullPage: true });
console.log("errors:", errors.length ? errors : "none");
await browser.close();
