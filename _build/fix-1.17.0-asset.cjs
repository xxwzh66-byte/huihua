/**
 * 只修 1.17.0 的发布资产，不碰 git 历史。
 *
 * 背景：第一版 huihua-1.17.0-arm64.apk 用错了一把临时密钥（证书 593b14d8…），
 * 老用户覆盖安装必然失败；versionCode 也错写成 1017000。
 * 这里做三件小事：
 *   1) 删掉 Release 上那个签名错误的 asset
 *   2) 上传用真 keystore（证书 9fe3dac1…）重签、versionCode 11700 的新包
 *   3) 用 _build/release-1.17.0.md 覆盖正文，并把 prerelease 转正
 *
 *   node _build/fix-1.17.0-asset.cjs            # 真跑
 *   node _build/fix-1.17.0-asset.cjs --dry-run  # 只看计划
 */
const fs = require("node:fs");
const path = require("node:path");
const { execSync } = require("node:child_process");

const REPO = "xxwzh66-byte/huihua";
const VERSION = "1.17.0";
const TAG = `v${VERSION}`;
const ROOT = path.resolve(__dirname, "..");
const APK = path.join(ROOT, "dist-apk", `huihua-${VERSION}-arm64.apk`);
const NOTES = path.join(ROOT, "_build", `release-${VERSION}.md`);
const ASSET = `huihua-${VERSION}-arm64.apk`;

// 必须与 1.0 → 1.16 一致。换这把证书 = 所有人重装。
const EXPECTED_CERT = "9fe3dac1f8807221bb66b8526b24684caa952a014d1e3fb219b831f40432bf9f";
const EXPECTED_CODE = 11700;

const DRY = process.argv.includes("--dry-run");

const TOKEN =
  process.env.GITHUB_TOKEN ||
  (() => {
    try {
      const out = execSync("git credential fill", {
        input: "protocol=https\nhost=github.com\n\n",
        encoding: "utf8",
        stdio: ["pipe", "pipe", "pipe"],
      });
      return (out.match(/^password=(.+)$/m) || [])[1];
    } catch {
      return undefined;
    }
  })();

const H = {
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
  "User-Agent": "huihua-release",
  ...(TOKEN ? { Authorization: `Bearer ${TOKEN.trim()}` } : {}),
};

async function gh(p, init = {}, { allow = [] } = {}) {
  const res = await fetch(`https://api.github.com${p}`, {
    ...init,
    headers: { ...H, ...(init.headers || {}) },
  });
  const text = await res.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!DRY && !res.ok && !allow.includes(res.status)) {
    throw new Error(`${init.method || "GET"} ${p} → ${res.status} ${text.slice(0, 300)}`);
  }
  return { status: res.status, body };
}

/** 本地把包验一遍：证书指纹 + versionCode。验不过就别上传。 */
function auditLocally() {
  if (!fs.existsSync(APK)) throw new Error(`找不到 ${APK}`);
  const sdk = fs.existsSync("D:\\demo\\android-sdk")
    ? "D:\\demo\\android-sdk"
    : "C:\\demo\\android-sdk";
  const apksigner = path.join(sdk, "build-tools", "35.0.0", "apksigner.bat");
  const aapt2 = path.join(sdk, "build-tools", "35.0.0", "aapt2.exe");
  const out = execSync(`"${apksigner}" verify --print-certs "${APK}"`, { encoding: "utf8" });
  const cert = (out.match(/certificate SHA-256 digest:\s*([0-9a-f]+)/i) || [])[1] || "";
  if (cert.toLowerCase() !== EXPECTED_CERT) {
    throw new Error(`证书不对：${cert || "读不到"}，应为 ${EXPECTED_CERT}。别传这个包。`);
  }
  const badging = execSync(`"${aapt2}" dump badging "${APK}"`, { encoding: "utf8" });
  const code = Number((badging.match(/versionCode='(\d+)'/) || [])[1]);
  if (code !== EXPECTED_CODE) {
    throw new Error(`versionCode 是 ${code}，应为 ${EXPECTED_CODE}。别传这个包。`);
  }
  const size = fs.statSync(APK).size;
  const sha = execSync(`certutil -hashfile "${APK}" SHA256`, { encoding: "utf8" })
    .split("\n")[1]
    .replace(/\s/g, "")
    .toLowerCase();
  console.log(`本地包 ok  证书 ${cert.slice(0, 8)}…  versionCode ${code}  ${size} 字节`);
  console.log(`本地包 sha256 ${sha}`);
  return { size, sha };
}

(async () => {
  const local = auditLocally();
  const body = fs.readFileSync(NOTES, "utf8").trim();

  const rel = await gh(`/repos/${REPO}/releases/tags/${TAG}`, {}, { allow: [404] });
  if (rel.status !== 200) throw new Error(`${TAG} 的 Release 不存在（${rel.status}）`);
  console.log(`release id=${rel.body.id} draft=${rel.body.draft} prerelease=${rel.body.prerelease}`);
  for (const a of rel.body.assets || []) {
    console.log(`  现有资产 ${a.name} ${a.size} ${a.digest || ""}`);
  }

  if (DRY) {
    console.log("\n--dry-run：未写入。");
    return;
  }
  if (!TOKEN) throw new Error("没有 token：设 GITHUB_TOKEN，或在 git credential 里存一个 repo scope 的 PAT");

  // 1) 删掉签名错误的旧资产（连同任何同名残留）
  for (const a of rel.body.assets || []) {
    if (a.name === ASSET) {
      const del = await gh(`/repos/${REPO}/releases/assets/${a.id}`, { method: "DELETE" });
      console.log(`asset delete ${a.name} (${a.id}) → ${del.status}`);
    }
  }

  // 2) 上传新包
  const buf = fs.readFileSync(APK);
  const up = await fetch(
    `https://uploads.github.com/repos/${REPO}/releases/${rel.body.id}/assets?name=${ASSET}`,
    {
      method: "POST",
      headers: { ...H, "Content-Type": "application/vnd.android.package-archive" },
      body: buf,
    },
  );
  const upBody = await up.json().catch(() => ({}));
  console.log(`upload ${up.status} ${upBody.name} ${upBody.size} ${upBody.digest || ""}`);
  if (up.status !== 201) throw new Error(`上传失败：${JSON.stringify(upBody).slice(0, 300)}`);
  if (upBody.digest && !upBody.digest.includes(local.sha)) {
    throw new Error(`上传后的 digest 与本地不一致：${upBody.digest} vs ${local.sha}`);
  }

  // 3) 正文 + 转正
  const patch = await gh(`/repos/${REPO}/releases/${rel.body.id}`, {
    method: "PATCH",
    body: JSON.stringify({ body, draft: false, prerelease: false }),
  });
  console.log(`release patch ${patch.status} draft=${patch.body.draft} prerelease=${patch.body.prerelease}`);

  const check = await gh(`/repos/${REPO}/releases/tags/${TAG}`);
  const a = (check.body.assets || []).find((x) => x.name === ASSET);
  console.log(`final ${check.body.tag_name} draft=${check.body.draft} prerelease=${check.body.prerelease}`);
  console.log(`final asset ${a && a.name} ${a && a.size} ${a && a.digest}`);
  if (!a || a.size !== local.size) throw new Error("回读校验失败：资产大小与本地不一致");
  console.log("done");
})();
