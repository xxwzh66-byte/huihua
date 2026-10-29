import { chromium } from "playwright";
const GRAPH = { prompt: {
 "1": { class_type:"CheckpointLoaderSimple", inputs:{ ckpt_name:"{{model}}" }, _meta:{title:"Load Checkpoint"} },
 "2": { class_type:"CLIPTextEncode", inputs:{ text:"{{prompt}}", clip:["1",1] }, _meta:{title:"Positive"} },
 "3": { class_type:"CLIPTextEncode", inputs:{ text:"{{negative}}", clip:["1",1] }, _meta:{title:"Negative"} },
 "4": { class_type:"EmptyLatentImage", inputs:{ width:"{{width}}", height:"{{height}}", batch_size:1 }, _meta:{} },
 "5": { class_type:"KSampler", inputs:{ seed:"{{seed}}", steps:"{{steps}}", cfg:"{{cfg}}", sampler_name:"{{sampler}}", scheduler:"{{scheduler}}", denoise:1, model:["1",0], positive:["2",0], negative:["3",0], latent_image:["4",0] }, _meta:{title:"Sampler"} },
 "6": { class_type:"VAEDecode", inputs:{ samples:["5",0], vae:["1",2] }, _meta:{} },
 "7": { class_type:"PreviewImage", inputs:{ images:["6",0] }, _meta:{} } } };
const info = {
 CheckpointLoaderSimple:{input:{required:{ckpt_name:[["sdxl.safetensors","anima.safetensors"],{}]}}},
 CLIPTextEncode:{input:{required:{text:["STRING",{}],clip:["CLIP",{}]}}},
 EmptyLatentImage:{input:{required:{width:["INT",{}],height:["INT",{}],batch_size:["INT",{}]}}},
 KSampler:{input:{required:{seed:["INT",{}],steps:["INT",{}],cfg:["FLOAT",{}],sampler_name:[["euler","euler_ancestral","dpmpp_2m"],{}],scheduler:[["normal","karras"],{}],denoise:["FLOAT",{}],model:["MODEL",{}],positive:["CONDITIONING",{}],negative:["CONDITIONING",{}],latent_image:["LATENT",{}]}}},
 VAEDecode:{input:{required:{samples:["LATENT",{}],vae:["VAE",{}]}}},
 PreviewImage:{input:{required:{images:["IMAGE",{}]}}},
};
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 412, height: 900 } });
await p.addInitScript(() => { localStorage.setItem("onboarding-done","true"); localStorage.setItem("mochi-language","zh-CN"); localStorage.setItem("workflow-library-v1","[]"); });
await p.route("**/__native", async (r) => {
  const { command, args } = r.request().postDataJSON();
  let value = null;
  if (command === "lock_status") value = { supported:false, available:false, enabled:false, unlocked:true };
  else if (command === "restore") value = "http://192.168.1.8:8188";
  else if (command === "llm_get") value = { base_url:"", model:"", temperature:0.7, has_key:false };
  else if (command === "update_action") value = { supported:false, phase:"idle", received:0, ready:false, available:false, canInstall:false };
  else if (command === "api") {
    const path = String(args?.path ?? "");
    if (path.startsWith("/api/system_stats")) value = { system:{os:"linux",python_version:"3.11",comfyui_version:"0.3.30"}, devices:[{name:"cuda:0 NVIDIA GeForce RTX 4070 SUPER",type:"cuda",vram_total:1,vram_free:1,torch_vram_total:0,torch_vram_free:0}] };
    else if (path.startsWith("/api/object_info")) value = info;
    else if (path.startsWith("/api/queue")) value = { queue_running:[], queue_pending:[] };
    else if (path.startsWith("/api/history")) value = {};
    else value = {};
  }
  await r.fulfill({ status:200, contentType:"application/json", body: JSON.stringify({ value }) });
});
await p.goto("http://127.0.0.1:14566/", { waitUntil:"domcontentloaded" });
await p.waitForTimeout(4300);
await p.locator(".studio-imports .segmented button").nth(1).click();
await p.waitForTimeout(700);
await p.locator(".collapsible-card h2 button").first().click();
await p.waitForTimeout(600);
await p.setInputFiles('input[accept*="json"]', { name:"wf.json", mimeType:"application/json", buffer: Buffer.from(JSON.stringify(GRAPH)) });
await p.waitForTimeout(1400);
await p.locator(".canvas-flow").first().scrollIntoViewIfNeeded();
await p.waitForTimeout(400);
await p.screenshot({ path:"D:/demo/Paint-v1/_build/shot-v111-flow1.png" });
await p.evaluate(() => { const el = document.querySelector(".canvas-flow"); if (el) el.scrollTop = 520; });
await p.waitForTimeout(400);
await p.screenshot({ path:"D:/demo/Paint-v1/_build/shot-v111-flow2.png" });
await p.locator('.node-bound').first().click();
await p.waitForTimeout(700);
await p.screenshot({ path:"D:/demo/Paint-v1/_build/shot-v111-bind.png" });
await b.close();
