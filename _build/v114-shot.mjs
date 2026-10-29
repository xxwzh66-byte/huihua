import { chromium } from "@playwright/test";

const html = `<!doctype html><html lang="zh-CN"><head><meta name="viewport" content="width=device-width,initial-scale=1"/><title>v1.14 canvas</title></head><body><div id="root"></div><script type="module">import RefreshRuntime from '/@react-refresh';RefreshRuntime.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>type=>type;window.__vite_plugin_react_preamble_installed__=true;await import('/tests/v114-harness.tsx');</script></body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 900 } });
await page.route("**/__v114**", (r) =>
  r.fulfill({ contentType: "text/html", body: html }),
);
await page.goto("http://127.0.0.1:14420/__v114");
await page.waitForSelector(".graph-node");
await page.waitForTimeout(300);
await page.screenshot({ path: "D:\\demo\\Paint-v1\\_build\\shot-v114-collapsed.png" });
await page.locator(".graph-node").filter({ hasText: "KSampler" }).first().click();
await page.waitForTimeout(250);
await page.locator(".canvas-detail").scrollIntoViewIfNeeded();
await page.waitForTimeout(200);
await page.screenshot({ path: "D:\\demo\\Paint-v1\\_build\\shot-v114-detail.png" });
await page.locator(".shelf-save input").fill("人像质感 v3");
await page.locator(".shelf-save-button").click();
await page.waitForTimeout(250);
await page.screenshot({ path: "D:\\demo\\Paint-v1\\_build\\shot-v114-shelf.png" });
await browser.close();
console.log("shots written");
