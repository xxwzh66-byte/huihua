import { chromium } from "playwright";

const BASE = process.env.BASE || "http://127.0.0.1:14555";

const NOTES = "这次主要解决「手机上工作流看不清」和「导入的工作流改完存不住」两件事。\n\n# 工作流可视化重做\n- 从原来的自由画布改成从上到下的流水线卡片：节点按依赖顺序竖排，不用缩放、不用拖拽也能看清每一步。\n- 每张卡片只显示关键字段，点一下就地改；数值、下拉、长文本分别用不同控件。\n- 顶栏显示节点数与占位符数量，一键展开占位符绑定面板。\n\n# 占位符：让工作流跟着自动设置走\n- 模型、正向提示词、负向提示词、VAE、步数、CFG、宽度、高度、种子、单批数量、采样器、调度器都能换成 `{{key}}`。\n- 点字段右侧的 chip 选择绑定，生成前自动替换成「自动设置」里的值，发给 ComfyUI 的 JSON 里不会残留 `{{`。\n- 「联动到自动设置」：把工作流里已有的真实参数反向写回自动模式，导入别人的工作流时不用再手抄。\n\n# 工作流库\n- 编辑过的 API 工作流可以命名保存到本机（最多 60 个），随时重新载入，也可以导出 JSON。\n- 保存的是带占位符的原始图，不会把自动设置的值固化进去。\n\n# 提示词助手\n- 新增「直接生成」：一个输入框写描述，输出一段纯提示词。\n- 输出后一键复制，浏览器/WebView 不支持 Clipboard API 时自动降级到隐藏 textarea 方案。\n- 仍然可以选择 skill 模板，让生成结果按模板结构组织。\n\n# 工坊\n- 实时预览对接工作流里的 PreviewImage / SaveImage 节点，出图直接显示在工坊预览区。\n- 设置里的「安全」板块已隐藏，常用项集中到「工坊」「生成 API」「服务器资源」「应用」四组。\n\n# 其他\n- 界面文案补齐简体中文/English 双语，共 885 条键。\n- 版本号 1.1.1（versionCode 10101），与 1.0.0 / 1.1.0 使用同一签名证书，可直接覆盖升级。\n\n# 安装\n- 下载 `huihua-1.1.1-arm64.apk`，需要 Android 10（API 29）及以上、arm64-v8a。\n- 首次安装需允许「安装未知来源应用」。\n- 已装旧版本的用户：应用内「检查更新」会弹出这个版本，也可以在设置里关闭自动检查。";

const release = {
  version: "1.1.1",
  size: 77186815,
  notes: NOTES,
  title: "绘画 v1.1.1",
  published: "2026-10-29T06:28:42Z",
  page: "https://github.com/xxwzh66-byte/huihua/releases/tag/v1.1.1",
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 412, height: 900 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));
page.on("console", (m) => {
  if (m.type() === "error") errors.push("console: " + m.text().slice(0, 200));
});

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
  else if (cmd === "update_action") {
    const action = (body.args && body.args.action) || "";
    if (action === "status" || action === "check")
      value = {
        supported: true,
        phase: "ready",
        error: null,
        received: 0,
        ready: false,
        available: true,
        canInstall: true,
        current: "1.1.1",
        release,
      };
    else value = { supported: true, phase: "idle", received: 0, ready: false, available: true, canInstall: true, current: "1.1.1", release };
  } else if (cmd === "llm_get")
    value = { base_url: "", model: "", temperature: 0.7, has_key: false };
  else if (cmd === "api") {
    const p = (body.args && body.args.path) || "";
    if (p === "/api/system_stats")
      value = {
        system: { os: "linux", ram_total: 68e9, ram_free: 40e9, comfyui_version: "0.3.40" },
        devices: [{ name: "cuda:0 NVIDIA GeForce RTX 4070 SUPER : cudaMallocAsync", vram_total: 12e9, vram_free: 9e9 }],
      };
    else if (p === "/api/object_info") value = {};
    else if (p === "/api/queue") value = { queue_running: [], queue_pending: [] };
    else value = {};
  }
  await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, value }) });
});

await page.goto(BASE, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(6000);

const dialog = await page.locator(".update-dialog").count();
console.log("update dialog count:", dialog);
if (dialog) {
  console.log("dialog text:", (await page.locator(".update-dialog").innerText()).replace(/\n+/g, " | ").slice(0, 700));
  await page.screenshot({ path: "D:/demo/Paint-v1/_build/shot-update.png" });
}

// settings toggle
await page.evaluate(() => document.querySelectorAll("button").forEach((b) => { if (b.textContent && b.textContent.trim() === "设置") b.click(); }));
await page.waitForTimeout(1200);
const groups = await page.locator(".settings-group > summary").allInnerTexts().catch(() => []);
console.log("settings groups:", JSON.stringify(groups.map((g) => g.trim())));
await page.evaluate(() => document.querySelectorAll("details").forEach((d) => { if (/应用/.test(d.innerText)) d.open = true; }));
await page.waitForTimeout(600);
const toggle = await page.locator(".update-settings, [class*=update]").count();
console.log("update settings nodes:", toggle);
const texts = await page.locator(".connections").innerText().catch(() => "");
const hit = texts.split("\n").filter((l) => /自动|更新|版本/.test(l));
console.log("update-related lines:", JSON.stringify(hit.slice(0, 12)));
await page.evaluate(() => { const app = [...document.querySelectorAll("details")].find((d) => /应用/.test(d.innerText)); if (app) app.scrollIntoView(); });
await page.waitForTimeout(500);
await page.screenshot({ path: "D:/demo/Paint-v1/_build/shot-update-settings.png" });

console.log("errors:", errors.length ? JSON.stringify(errors.slice(0, 4)) : "none");
await browser.close();
