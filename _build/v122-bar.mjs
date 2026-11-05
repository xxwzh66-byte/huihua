import { chromium } from "@playwright/test";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
await page.route("**/__native", async (r) => {
  const b = JSON.parse(r.request().postData() || "{}");
  const a = b.args || {};
  let v = {};
  if (b.command === "lock_status") v = { supported: false, available: false, enabled: false, unlocked: true, delay: 0, hideRecents: false, autoPrompt: false };
  else if (b.command === "restore") v = "http://192.168.1.8:8188";
  else if (b.command === "api" && a.path === "/api/system_stats") v = { system: {}, devices: [{ name: "RTX 4090", type: "cuda", vram_total: 1, vram_free: 23113478144 }] };
  else if (b.command === "api" && a.path === "/api/object_info") v = {};
  else if (b.command === "api" && a.path === "/api/queue") v = { queue_running: [], queue_pending: [] };
  else if (b.command === "api" && String(a.path).startsWith("/api/history")) v = {};
  else if (b.command === "llm_get") v = { base_url: "", model: "", has_key: false };
  await r.fulfill({ contentType: "application/json", body: JSON.stringify({ value: v }) });
});
await page.addInitScript(() => { localStorage.setItem("mochi-language", "zh-CN"); localStorage.setItem("mochi-update-auto", "false"); });
await page.goto("http://127.0.0.1:14420/", { waitUntil: "domcontentloaded" });
await page.waitForSelector(".generate-bar", { timeout: 20000 });
await page.waitForTimeout(1200);
console.log(await page.evaluate(() => {
  const bar = document.querySelector(".generate-bar");
  const st = getComputedStyle(bar);
  const r = bar.getBoundingClientRect();
  const panel = document.querySelector(".render-panel").getBoundingClientRect();
  const dock = document.querySelector("aside.sidebar").getBoundingClientRect();
  const kids = [...bar.children].map((c) => {
    const cr = c.getBoundingClientRect();
    const cs = getComputedStyle(c);
    return `${c.tagName} .${c.className} h=${Math.round(cr.height)} w=${Math.round(cr.width)} display=${cs.display} mh=${cs.minHeight} pad=${cs.padding}`;
  });
  return JSON.stringify({
    kids,
    bs: { h: Math.round(r.height), pad: st.padding, display: st.display, wrap: st.flexWrap },
    pos: st.position,
    bottom: st.bottom,
    bar: { top: Math.round(r.top), bottom: Math.round(r.bottom), h: Math.round(r.height) },
    panel: { top: Math.round(panel.top), bottom: Math.round(panel.bottom) },
    dock: { top: Math.round(dock.top), bottom: Math.round(dock.bottom) },
    vh: innerHeight,
  }, null, 1);
}));
await page.screenshot({ path: "_build/v122-bar.png" });
await browser.close();
