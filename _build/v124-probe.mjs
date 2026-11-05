import { chromium } from "@playwright/test";
const SERVER = "http://192.168.1.8:8188";
const info = { CheckpointLoaderSimple: { class_type:"CheckpointLoaderSimple", input:{ required:{ ckpt_name:[["sd_xl_base_1.0.safetensors"],{}] } } } };
function answer(c,a){
  if(c==="lock_status")return{supported:false,available:false,enabled:false,unlocked:true};
  if(c==="restore")return SERVER;
  if(c==="image"||c==="save_image")return"";
  if(c==="update_action")return{supported:false,phase:"idle",available:false};
  if(c==="llm_get")return{base_url:"",model:"",temperature:0.7,has_key:false};
  if(c==="api"){const p=a?.path??"";
    if(p==="/api/system_stats")return{system:{},devices:[{name:"cuda:0 RTX 4090",vram_total:25757220864,vram_free:23113478144}]};
    if(p==="/api/object_info")return info;
    if(p==="/api/queue")return{queue_running:[],queue_pending:[]};
    if(p.startsWith("/api/history"))return{};}
  return {};
}
const b = await chromium.launch();
const p = await b.newPage({ viewport:{width:390,height:844} });
await p.route("**/__native", async r => { const d=JSON.parse(r.request().postData()||"{}"); await r.fulfill({contentType:"application/json",body:JSON.stringify({value:answer(d.command,d.args)})}); });
await p.addInitScript((s)=>{localStorage.clear();localStorage.setItem("mochi-language","zh-CN");localStorage.setItem("mochi-update-auto","false");localStorage.setItem("settings",JSON.stringify({model:"sd_xl_base_1.0.safetensors",sampler:"euler_ancestral",scheduler:"normal"}));localStorage.setItem("server",s);},SERVER);
await p.goto("http://127.0.0.1:14420/",{waitUntil:"domcontentloaded"});
await p.waitForSelector(".generate-bar",{timeout:15000});
await p.evaluate(()=>{const bs=document.querySelectorAll("aside nav button");bs[bs.length-1]?.click();});
await p.waitForTimeout(900);
const gs=p.locator("details.settings-group");
const g=gs.nth((await gs.count())-1);
await g.locator("summary").click();
await p.waitForTimeout(400);
const btn=g.locator(".project-link > button");
await btn.scrollIntoViewIfNeeded();
const dump = await btn.evaluate(n=>{
  const cs=getComputedStyle(n);
  const kids=[...n.querySelectorAll("*")].map(k=>{const c=getComputedStyle(k);return {tag:k.tagName,cls:k.className,color:c.color,fs:c.fontSize,display:c.display,w:k.getBoundingClientRect().width,h:k.getBoundingClientRect().height,text:(k.textContent||"").slice(0,30)};});
  const r=n.getBoundingClientRect();
  return {rect:{x:r.x,y:r.y,w:r.width,h:r.height},bg:cs.backgroundColor,color:cs.color,display:cs.display,gap:cs.gap,cols:cs.gridTemplateColumns,kids};
});
console.log(JSON.stringify(dump,null,1));
const box = await btn.boundingBox();
if(box) await p.screenshot({path:"D:/demo/Paint-v1/_build/v124-row.png", clip:{x:box.x-6,y:box.y-6,width:box.width+12,height:box.height+12}});
await b.close();
