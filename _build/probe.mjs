import { chromium } from "playwright";

const base = "http://127.0.0.1:14555";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 412, height: 900 } });
await page.addInitScript(() => {
  localStorage.setItem("onboarding-done", "true");
  localStorage.setItem("mochi-language", "zh-CN");
});
await page.route("**/__native", async (route) => {
  const { command, args } = route.request().postDataJSON();
  let value = {};
  if (command === "restore") value = "http://127.0.0.1:8188";
  if (command === "update_action") value = { supported: true, phase: "idle", received: 0, ready: false, available: false, canInstall: true };
  if (command === "api") {
    const p = String(args.path ?? "");
    if (p === "/api/system_stats") value = { system: { ram_total: 1, ram_free: 1 }, devices: [{ name: "GPU", vram_total: 1, vram_free: 1 }] };
    else if (p === "/api/object_info") value = {};
    else if (p === "/api/queue") value = { queue_running: [], queue_pending: [] };
  }
  await route.fulfill({ json: { value } });
});
await page.goto(base, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(4000);
console.log("buttons:", JSON.stringify(await page.locator("button").allTextContents()));
console.log("classes:", JSON.stringify(await page.evaluate(() => Array.from(document.querySelectorAll("*[class]")).map((e) => e.className).filter((c) => typeof c === "string" && /import|segment|studio/i.test(c)))));
console.log("fileinputs:", await page.locator('input[type=file]').count());
await browser.close();
