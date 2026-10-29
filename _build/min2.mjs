import { chromium } from "playwright";

const base = "http://127.0.0.1:14555";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 412, height: 900 } });
page.setDefaultTimeout(15000);
console.log("launched");
await page.addInitScript(() => {
  localStorage.setItem("onboarding-done", "true");
  localStorage.setItem("mochi-language", "zh-CN");
});
await page.route("**/__native", async (route) => {
  const body = route.request().postDataJSON();
  const command = body?.command;
  const args = body?.args ?? {};
  let value = {};
  if (command === "restore") value = "http://127.0.0.1:8188";
  if (command === "connect_server") value = "http://127.0.0.1:8188";
  if (command === "llm_get") value = { base_url: "", model: "", temperature: 0.7, has_key: false };
  if (command === "update_action")
    value = { supported: true, phase: "idle", received: 0, ready: false, available: false, canInstall: true };
  if (command === "api") {
    const p = String(args.path ?? "");
    if (p === "/api/system_stats")
      value = {
        system: { ram_total: 68719476736, ram_free: 34359738368 },
        devices: [{ name: "RTX 4070 SUPER", vram_total: 12884901888, vram_free: 9663676416 }],
      };
    else if (p === "/api/queue") value = { queue_running: [], queue_pending: [] };
  }
  await route.fulfill({ json: { value } });
});
console.log("routes ready");
await page.goto(base, { waitUntil: "domcontentloaded", timeout: 20000 });
console.log("dom ready");
await page.waitForTimeout(4000);
console.log("text head:", (await page.locator("body").innerText()).slice(0, 80).replace(/\n/g, " | "));
await page.screenshot({ path: "D:/demo/Paint-v1/_build/shot-settings.png" });
console.log("shot saved");
await browser.close();
console.log("done");
