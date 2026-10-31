// 清理重复的 draft Release，并核对最终状态。
const fs = require("node:fs");
const path = require("node:path");
const REPO = "xxwzh66-byte/huihua";
const TAG = "v1.17.0";
const TOKEN = fs.readFileSync(path.join(__dirname, ".ghtoken"), "utf8").trim();
const H = {
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
  "User-Agent": "huihua-release",
  Authorization: `Bearer ${TOKEN}`,
};

async function gh(p, init = {}) {
  const res = await fetch(`https://api.github.com${p}`, {
    ...init,
    headers: { ...H, ...(init.headers || {}) },
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

(async () => {
  const list = await gh(`/repos/${REPO}/releases?per_page=10`);
  for (const r of list.body) {
    if (r.tag_name !== TAG) continue;
    console.log(`release ${r.id} draft=${r.draft} prerelease=${r.prerelease} assets=${(r.assets || []).length}`);
    if (r.draft) {
      const del = await gh(`/repos/${REPO}/releases/${r.id}`, { method: "DELETE" });
      console.log(`  delete draft ${r.id} → ${del.status}`);
    }
  }

  const rel = await gh(`/repos/${REPO}/releases/tags/${TAG}`);
  console.log("final release", rel.status, rel.body?.id, "draft:", rel.body?.draft, "pre:", rel.body?.prerelease, "url:", rel.body?.html_url);

  const refTag = await gh(`/repos/${REPO}/git/ref/tags/${TAG}`);
  const refMain = await gh(`/repos/${REPO}/git/ref/heads/main`);
  console.log("tag  →", refTag.body?.object?.sha?.slice(0, 7), refTag.body?.object?.type);
  console.log("main →", refMain.body?.object?.sha?.slice(0, 7));

  const pkg = await gh(`/repos/${REPO}/contents/package.json?ref=${TAG}`);
  const pkgJson = JSON.parse(Buffer.from(pkg.body.content, "base64").toString("utf8"));
  console.log("package.json version on tag:", pkgJson.version);

  const names = await gh(`/repos/${REPO}/contents/src/wardrobeNames.ts?ref=${TAG}`);
  console.log("src/wardrobeNames.ts on tag:", names.status, names.body?.size, "字节");
})();
