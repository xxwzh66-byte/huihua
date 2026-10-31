/**
 * 设备码登录 → 拿到 token 后立刻发版。
 *   node _build/gh-login-and-publish.cjs D45B-D071
 * 只是把 gh 的 device flow 手写了一遍（这台机器没有 gh，github.com 还要重试）。
 */
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const CLIENT_ID = "178c6fc778ccc68e1d6a";
const ROOT = path.resolve(__dirname, "..");
const TOKEN_FILE = path.join(__dirname, ".ghtoken");

async function post(f, form) {
  const res = await fetch(`https://github.com${f}`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": "huihua-release",
    },
    body: new URLSearchParams(form).toString(),
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

(async () => {
  // 1) 拿 device code
  let dev = null;
  for (let i = 1; i <= 8 && !dev; i++) {
    try {
      const r = await post("/login/device/code", { client_id: CLIENT_ID, scope: "repo" });
      if (r.body?.user_code) dev = r.body;
      else console.log(`attempt ${i}: ${r.status} ${JSON.stringify(r.body)}`);
    } catch (e) {
      console.log(`attempt ${i}: ${e.code || e.message}`);
    }
    if (!dev) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 3000);
  }
  if (!dev) throw new Error("拿不到 device code");

  console.log(`>>> 打开 ${dev.verification_uri} ，输入 ${dev.user_code} ，授权 GitHub CLI`);
  console.log(`>>> device_code 有效期 ${dev.expires_in}s，正在轮询…`);

  // 2) 轮询换 token
  const deadline = Date.now() + dev.expires_in * 1000;
  let token = null;
  while (Date.now() < deadline && !token) {
    await new Promise((r) => setTimeout(r, (dev.interval || 5) * 1000));
    const r = await post("/login/oauth/access_token", {
      client_id: CLIENT_ID,
      device_code: dev.device_code,
      grant_type: "urn:ietf:params:oauth:grant-type:device_code",
    });
    if (r.body?.access_token) token = r.body.access_token;
    else if (r.body?.error && r.body.error !== "authorization_pending") {
      console.log(`poll: ${r.body.error}`);
      if (r.body.error === "slow_down") continue;
      if (r.body.error === "expired_token" || r.body.error === "access_denied") break;
    }
  }
  if (!token) throw new Error("没有拿到 token（超时或拒绝）");

  fs.writeFileSync(TOKEN_FILE, token, { mode: 0o600 });
  console.log(`OK token 已保存（${token.slice(0, 7)}…，${token.length} 字符），开始发版`);

  // 3) 发版
  const run = spawnSync(process.execPath, [path.join(__dirname, "publish-1.17.0.cjs")], {
    cwd: ROOT,
    env: { ...process.env, GITHUB_TOKEN: token },
    stdio: "inherit",
  });
  process.exit(run.status ?? 1);
})();
