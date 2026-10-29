import { chromium } from "@playwright/test";

const html = `<!doctype html><html lang="zh-CN"><head><meta name="viewport" content="width=device-width,initial-scale=1"/></head><body><div id="root"></div><script type="module">import RefreshRuntime from '/@react-refresh';RefreshRuntime.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>type=>type;window.__vite_plugin_react_preamble_installed__=true;await import('/tests/v114-harness.tsx');</script></body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 900 } });
await page.route("**/__v114**", (r) => r.fulfill({ contentType: "text/html", body: html }));
await page.goto("http://127.0.0.1:14420/__v114");
await page.waitForSelector(".graph-node");
await page.locator(".graph-node").filter({ hasText: "KSampler" }).first().click();
await page.waitForTimeout(300);
const info = await page.evaluate(() => {
  const field = document.querySelector(".canvas-detail .node-field");
  const head = field.firstElementChild;
  const out = { head: { cls: head.className, h: Math.round(head.getBoundingClientRect().height), html: head.outerHTML.slice(0, 400) }, parts: [] };
  for (const el of head.querySelectorAll("*")) {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    out.parts.push({ tag: el.tagName, cls: el.className, w: Math.round(r.width), h: Math.round(r.height), display: cs.display, ws: cs.whiteSpace, text: (el.textContent || "").slice(0, 20) });
  }
  return out;
});
console.log(JSON.stringify(info, null, 2));
await browser.close();
