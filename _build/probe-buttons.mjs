import { chromium } from "playwright";
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 412, height: 900 } });
await p.addInitScript(() => { localStorage.setItem("onboarding-done","true"); localStorage.setItem("mochi-language","zh-CN"); });
await p.route("**/__native", async (r) => {
  const { command, args } = r.request().postDataJSON();
  let value = null;
  if (command === "lock_status") value = { supported:false, available:false, enabled:false, unlocked:true };
  else if (command === "restore") value = "http://192.168.1.8:8188";
  else if (command === "llm_get") value = { base_url:"", model:"", temperature:0.7, has_key:false };
  else if (command === "update_action") value = { supported:false, phase:"idle", received:0, ready:false, available:false, canInstall:false };
  else if (command === "api") {
    const path = String(args?.path ?? "");
    if (path.startsWith("/api/system_stats")) value = { system:{os:"linux",python_version:"3.11",comfyui_version:"0.3.30"}, devices:[{name:"cuda:0 NVIDIA GeForce RTX 4070 SUPER",type:"cuda",vram_total:25757220864,vram_free:9663676416,torch_vram_total:0,torch_vram_free:0}] };
    else if (path.startsWith("/api/queue")) value = { queue_running:[], queue_pending:[] };
    else value = {};
  }
  await r.fulfill({ status:200, contentType:"application/json", body: JSON.stringify({ value }) });
});
await p.goto("http://127.0.0.1:14566/", { waitUntil: "domcontentloaded" });
await p.waitForTimeout(4300);
const btns = await p.$$eval("button", els => els.map(e => (e.getAttribute("aria-label") || e.innerText || "").trim().replace(/\s+/g," ")).filter(Boolean));
console.log(JSON.stringify(btns.slice(0, 60)));
await b.close();
