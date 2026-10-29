import { chromium } from "playwright";

const BASE = process.env.BASE || "http://127.0.0.1:14555";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 412, height: 900 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e).slice(0, 160)));

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
  else if (cmd === "update_action")
    value = {
      supported: true,
      phase: "idle",
      received: 0,
      ready: false,
      available: false,
      canInstall: true,
      current: "1.1.0",
    };
  else if (cmd === "llm_get")
    value = { base_url: "", model: "", temperature: 0.7, has_key: false };
  else if (cmd === "api") {
    const p = (body.args && body.args.path) || "";
    if (p === "/api/system_stats")
      value = {
        system: { os: "linux", ram_total: 68e9, ram_free: 40e9 },
        devices: [{ name: "cuda:0 NVIDIA GeForce RTX 4070 SUPER", vram_total: 12e9, vram_free: 9e9 }],
      };
    else value = p === "/api/queue" ? { queue_running: [], queue_pending: [] } : {};
  }
  await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, value }) });
});

await page.goto(BASE, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(6000);

await page.evaluate(() => {
  document.querySelectorAll("button").forEach((b) => {
    if ((b.textContent || "").trim() === "设置") b.click();
  });
});
await page.waitForTimeout(1200);
await page.evaluate(() => {
  document.querySelectorAll("details").forEach((d) => {
    if ((d.querySelector("summary")?.textContent || "").includes("应用")) d.open = true;
  });
});
await page.waitForTimeout(800);

const sw = page.locator(".update-settings .switch, .update-settings [role=switch], .update-settings input[type=checkbox]").first();
console.log("switch found:", await sw.count());
const before = await page.evaluate(() => localStorage.getItem("mochi-update-auto"));
await sw.click({ force: true }).catch((e) => console.log("click fail", String(e).slice(0, 120)));
await page.waitForTimeout(500);
const after = await page.evaluate(() => localStorage.getItem("mochi-update-auto"));
console.log("auto before:", before, "→ after:", after);
await sw.click({ force: true }).catch(() => {});
await page.waitForTimeout(400);
console.log("auto restored:", await page.evaluate(() => localStorage.getItem("mochi-update-auto")));

const upd = await page.locator(".update-settings").innerText().catch(() => "");
console.log("update settings text:", upd.replace(/\n+/g, " | "));
await page.locator(".update-settings").scrollIntoViewIfNeeded().catch(() => {});
await page.screenshot({ path: "D:/demo/Paint-v1/_build/shot-update-settings.png" });
console.log("errors:", errors.length ? JSON.stringify(errors.slice(0, 3)) : "none");
await browser.close();
