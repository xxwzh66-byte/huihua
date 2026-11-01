/**
 * 发布 1.19.0：全程走 api.github.com（github.com:443 间歇阻断）。
 *
 *   node _build/publish-1.19.0.cjs --dry-run
 *   node _build/publish-1.19.0.cjs
 *
 * 前提：dist-apk/huihua-1.19.0-arm64.apk 已由 build-apk.ps1 产出（它已自检证书与 versionCode）。
 * 上传前会在本地复核：证书指纹必须等于 EXPECTED_CERT，versionCode 必须等于 11900，SHA-256 必须等于 HASH。
 * 不符就抛错，不碰远端。
 */
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { execSync } = require("node:child_process");

const REPO = "xxwzh66-byte/huihua";
const VERSION = "1.19.0";
const TAG = `v${VERSION}`;
const ROOT = path.resolve(__dirname, "..");
const APK = path.join(ROOT, "dist-apk", `huihua-${VERSION}-arm64.apk`);
const NOTES = path.join(ROOT, "_build", `release-${VERSION}.md`);
const HASH = "44792687f76ab380164b3d323a6797b62a46cd67792cc99119d2681469498cdb";
const EXPECTED_CERT = "9fe3dac1f8807221bb66b8526b24684caa952a014d1e3fb219b831f40432bf9f";
const EXPECTED_CODE = "11900";
const DRY = process.argv.includes("--dry-run");

const SDK = fs.existsSync("D:/demo/android-sdk")
  ? "D:/demo/android-sdk"
  : "C:/demo/android-sdk";
const APKSIGNER = path.join(SDK, "build-tools/35.0.0/apksigner.bat");
const AAPT2 = path.join(SDK, "build-tools/35.0.0/aapt2.exe");

function token() {
  const out = execSync("git credential fill", {
    input: "protocol=https\nhost=github.com\n\n",
    encoding: "utf8",
  });
  const m = out.match(/^password=(.+)$/m);
  if (!m) throw new Error("凭据里没有 GitHub token");
  return m[1].trim();
}

const H = {
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
  "User-Agent": "huihua-release",
};

async function gh(p, init = {}) {
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
  return { status: res.status, body };
}

function verifyLocal() {
  if (!fs.existsSync(APK)) throw new Error(`找不到 ${APK}`);
  const buf = fs.readFileSync(APK);
  const digest = crypto.createHash("sha256").update(buf).digest("hex");
  console.log("apk   ", buf.length, "bytes");
  console.log("sha256", digest);
  if (digest !== HASH) throw new Error(`SHA-256 不符：本地 ${digest}，脚本写的是 ${HASH}`);

  const certs = execSync(`"${APKSIGNER}" verify --print-certs "${APK}"`, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  const hit = /certificate SHA-256 digest:\s*([0-9a-f]+)/i.exec(certs);
  const cert = (hit?.[1] || "").toLowerCase();
  console.log("cert  ", cert);
  if (cert !== EXPECTED_CERT) throw new Error(`签名证书不符：${cert}`);

  const badging = execSync(`"${AAPT2}" dump badging "${APK}"`, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  const code = /versionCode='(\d+)'/.exec(badging)?.[1];
  console.log("code  ", code);
  if (code !== EXPECTED_CODE) throw new Error(`versionCode 不符：${code}`);
}

(async () => {
  verifyLocal();
  const body = fs.readFileSync(NOTES, "utf8").trim();
  const asset = `huihua-${VERSION}-arm64.apk`;

  if (DRY) {
    console.log("dry run：不创建 release，不上传");
    return;
  }

  if (!H.Authorization) H.Authorization = `Bearer ${token()}`;

  let rel = await gh(`/repos/${REPO}/releases/tags/${TAG}`);
  if (rel.status === 404) {
    rel = await gh(`/repos/${REPO}/releases`, {
      method: "POST",
      body: JSON.stringify({
        tag_name: TAG,
        target_commitish: "main",
        name: `绘画 ${TAG}`,
        body,
        draft: false,
        prerelease: false,
      }),
    });
    console.log("create", rel.status, rel.body?.id);
  } else {
    const upd = await gh(`/repos/${REPO}/releases/${rel.body.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        name: `绘画 ${TAG}`,
        body,
        draft: false,
        prerelease: false,
      }),
    });
    console.log("update", upd.status, upd.body?.id);
    rel = upd;
  }
  if (!rel.body?.id) throw new Error("release 失败：" + JSON.stringify(rel.body));
  const id = rel.body.id;

  for (const a of rel.body.assets || []) {
    if (a.name === asset) {
      const del = await gh(`/repos/${REPO}/releases/assets/${a.id}`, {
        method: "DELETE",
      });
      console.log("delete old asset", del.status);
    }
  }

  const buf = fs.readFileSync(APK);
  const up = await fetch(
    `https://uploads.github.com/repos/${REPO}/releases/${id}/assets?name=${asset}`,
    {
      method: "POST",
      headers: {
        ...H,
        "Content-Type": "application/vnd.android.package-archive",
        "Content-Length": String(buf.length),
      },
      body: buf,
    },
  );
  const upBody = await up.json().catch(() => ({}));
  console.log("upload", up.status, upBody.name, upBody.size, upBody.digest);

  const check = await gh(`/repos/${REPO}/releases/tags/${TAG}`);
  const a = (check.body.assets || []).find((x) => x.name === asset);
  console.log(
    "final",
    check.body.tag_name,
    check.body.name,
    a && a.size,
    a && a.digest,
  );
  console.log("digest ok:", a && a.digest === `sha256:${HASH}`);
})().catch((error) => {
  console.error("失败：", error.message);
  process.exit(1);
});
