import { chromium } from "playwright";

const BASE = process.env.BASE || "http://127.0.0.1:14590";
const SHOT = "D:/demo/Paint-v1/_build/shot-prompt-page.png";

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
});

let chatCalls = 0;
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
    chatCalls += 1;
    value = {
      content:
        "1girl, solo, tokyo street, rain, pink neon, wet asphalt, reflection",
      model: "mock-model",
    };
  } else if (cmd === "api") {
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
    else if (p === "/api/object_info") value = {};
    else if (p === "/api/queue")
      value = { queue_running: [], queue_pending: [] };
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

const navs = await page.locator(".sidebar nav button").allInnerTexts();
console.log(
  "nav:",
  JSON.stringify(navs.map((s) => s.replace(/\s+/g, " ").trim()).filter(Boolean)),
);

await page.locator(".sidebar nav button").nth(1).click();
await page.waitForTimeout(1200);

const heading = await page
  .locator('[data-page="prompt"] h1')
  .first()
  .innerText()
  .catch(() => "(none)");
console.log("heading:", heading.trim());
console.log(
  "blocks:",
  await page.locator('[data-page="prompt"] .studio-block').count(),
);

await page
  .locator('[data-page="prompt"] textarea')
  .fill("rainy tokyo street, pink neon");
await page.locator('[data-page="prompt"] .studio-actions button.primary').click();
await page.waitForTimeout(1800);
console.log("chatCalls:", chatCalls);
const out = await page
  .locator('[data-page="prompt"] .studio-output')
  .innerText()
  .catch(() => "(none)");
console.log("output:", out);
console.log(
  "history rows:",
  await page.locator('[data-page="prompt"] .studio-history li').count(),
);
await page.screenshot({ path: SHOT, fullPage: true });

await page.locator('[data-page="prompt"] button:has-text("填入工坊正向提示词")').click();
await page.waitForTimeout(1400);
console.log(
  "tab after insert:",
  await page.evaluate(
    () => document.querySelector(".active-pane")?.dataset?.page ?? "?",
  ),
);
console.log(
  "settings:",
  await page.evaluate(() =>
    (localStorage.getItem("settings") || "(none)").slice(0, 160),
  ),
);
console.log("errors:", errors.length ? errors : "none");
await browser.close();
