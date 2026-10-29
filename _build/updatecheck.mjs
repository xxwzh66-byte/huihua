import { chromium } from "playwright";

const BASE = process.env.BASE || "http://127.0.0.1:14555";

const NOTES = `## 绘画 1.1.0

本次更新带来四项新能力，并让应用可以自己检查更新。

### 新增
- 生成 API：填入任意 OpenAI 兼容接口
- skill 模板：导入 SKILL.md 与 data/*.csv
- 可视化工作流：节点卡片与连线
- 服务器资源：模型、文本编码器、VAE、LoRA

### 优化
- 设置页重新分组
- 修复生成 API 面板空白时白屏`;

const release = {
  version: "1.1.0",
  size: 77186815,
  notes: NOTES,
  title: "绘画 v1.1.0",
  published: "2026-10-29T06:28:42Z",
  page: "https://github.com/xxwzh66-byte/huihua/releases/tag/v1.1.0",
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 412, height: 900 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));
page.on("console", (m) => {
  if (m.type() === "error") errors.push("console: " + m.text().slice(0, 200));
});

await page.addInitScript(() => {
  localStorage.setItem("onboarding-done", "true");
  localStorage.setItem("mochi-language", "zh-CN");
  localStorage.removeItem("mochi-update-auto");
  localStorage.removeItem("mochi-update-check");
});

await page.route("**/__native", async (route) => {
  const body = route.request().postDataJSON() ?? {};
  const cmd = body.cmd ?? body.command ?? "";
  let value = null;
  if (cmd === "restore") value = "http://127.0.0.1:8188";
  else if (cmd === "lock_status")
    value = { supported: false, available: false, enabled: false, unlocked: true };
  else if (cmd === "update_action") {
    const action = (body.args && body.args.action) || "";
    if (action === "status" || action === "check")
      value = {
        supported: true,
        phase: "ready",
        error: null,
        received: 0,
        ready: false,
        available: true,
        canInstall: true,
        current: "1.1.0",
        release,
      };
    else value = { supported: true, phase: "idle", received: 0, ready: false, available: true, canInstall: true, current: "1.1.0", release };
  } else if (cmd === "llm_get")
    value = { base_url: "", model: "", temperature: 0.7, has_key: false };
  else if (cmd === "api") {
    const p = (body.args && body.args.path) || "";
    if (p === "/api/system_stats")
      value = {
        system: { os: "linux", ram_total: 68e9, ram_free: 40e9, comfyui_version: "0.3.40" },
        devices: [{ name: "cuda:0 NVIDIA GeForce RTX 4070 SUPER : cudaMallocAsync", vram_total: 12e9, vram_free: 9e9 }],
      };
    else if (p === "/api/object_info") value = {};
    else if (p === "/api/queue") value = { queue_running: [], queue_pending: [] };
    else value = {};
  }
  await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, value }) });
});

await page.goto(BASE, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(6000);

const dialog = await page.locator(".update-dialog").count();
console.log("update dialog count:", dialog);
if (dialog) {
  console.log("dialog text:", (await page.locator(".update-dialog").innerText()).replace(/\n+/g, " | ").slice(0, 700));
  await page.screenshot({ path: "D:/demo/Paint-v1/_build/shot-update.png" });
}

// settings toggle
await page.evaluate(() => document.querySelectorAll("button").forEach((b) => { if (b.textContent && b.textContent.trim() === "设置") b.click(); }));
await page.waitForTimeout(1200);
const groups = await page.locator(".settings-group > summary").allInnerTexts().catch(() => []);
console.log("settings groups:", JSON.stringify(groups.map((g) => g.trim())));
await page.evaluate(() => document.querySelectorAll("details").forEach((d) => { if (/应用/.test(d.innerText)) d.open = true; }));
await page.waitForTimeout(600);
const toggle = await page.locator(".update-settings, [class*=update]").count();
console.log("update settings nodes:", toggle);
const texts = await page.locator(".connections").innerText().catch(() => "");
const hit = texts.split("\n").filter((l) => /自动|更新|版本/.test(l));
console.log("update-related lines:", JSON.stringify(hit.slice(0, 12)));
await page.evaluate(() => { const app = [...document.querySelectorAll("details")].find((d) => /应用/.test(d.innerText)); if (app) app.scrollIntoView(); });
await page.waitForTimeout(500);
await page.screenshot({ path: "D:/demo/Paint-v1/_build/shot-update-settings.png" });

console.log("errors:", errors.length ? JSON.stringify(errors.slice(0, 4)) : "none");
await browser.close();
