import { chromium } from "playwright";

const base = "http://127.0.0.1:14555";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 412, height: 900 } });
const log = [];
page.on("pageerror", (e) => log.push("PAGEERROR " + (e && e.stack ? e.stack : String(e))));
page.on("console", (m) => log.push(m.type() + ": " + m.text()));
await page.addInitScript(() => {
  localStorage.setItem("onboarding-done", "true");
  localStorage.setItem("mochi-language", "zh-CN");
});
await page.route("**/__native", (r) => r.fulfill({ json: { value: { supported: false, available: false, enabled: false, unlocked: true } } }));`nawait page.goto(base, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(4000);
console.log("html len:", (await page.content()).length);
console.log("body len:", (await page.locator("body").innerText()).length);
console.log("root html:", (await page.locator("#root").innerHTML().catch(() => "no root")).slice(0, 200));
console.log(log.slice(0, 10).join("\n").slice(0, 3000));
await browser.close();
