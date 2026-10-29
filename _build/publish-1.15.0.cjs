const fs = require("node:fs");
const { execSync } = require("node:child_process");

const REPO = "xxwzh66-byte/huihua";
const VERSION = "1.15.0";
const TAG = `v${VERSION}`;
const APK = `D:/demo/Paint-v1/dist-apk/huihua-${VERSION}-arm64.apk`;
const NOTES = "D:/demo/Paint-v1/_build/release-1.15.0.md";
const HASH = "9b86385a6838c3f30a5fdde3c4bca9754ad58517cd7d0a76167f99aa4102554b";

function token() {
  const out = execSync("git credential fill", {
    input: "protocol=https\nhost=github.com\n\n",
    encoding: "utf8",
  });
  const m = out.match(/^password=(.+)$/m);
  if (!m) throw new Error("no token");
  return m[1].trim();
}

const TOKEN = token();
const H = {
  Authorization: `Bearer ${TOKEN}`,
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
  "User-Agent": "huihua-release",
};

async function gh(path, init = {}) {
  const res = await fetch(`https://api.github.com${path}`, {
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

(async () => {
  const body = fs.readFileSync(NOTES, "utf8").trim();
  const asset = `huihua-${VERSION}-arm64.apk`;

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
  if (!rel.body?.id) throw new Error("release failed: " + JSON.stringify(rel.body));
  const id = rel.body.id;

  for (const a of rel.body.assets || []) {
    if (a.name === asset) {
      const del = await gh(`/repos/${REPO}/releases/assets/${a.id}`, { method: "DELETE" });
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
  console.log("final", check.body.tag_name, check.body.name, a && a.size, a && a.digest);
  console.log("digest ok:", a && a.digest === `sha256:${HASH}`);
})();
