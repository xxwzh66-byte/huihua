/**
 * 发布 1.17.0：全程走 api.github.com（本机访问不了 github.com，git push 走不通）。
 *
 *   node _build/publish-1.17.0.cjs --dry-run     # 只打印计划，不写任何东西
 *   GITHUB_TOKEN=ghp_xxx node _build/publish-1.17.0.cjs
 *
 * 做的事：把本地 v1.17 的改动（相对 baseline 5d1b6a8 的 diff）作为一次真正的提交
 * 叠到上游 main 上（fast-forward），然后建 tag v1.17.0 与 Release；
 * dist-apk/huihua-1.17.0-arm64.apk 存在就顺手上传，不存在则发成 draft。
 * 不 force push，不改历史。
 */
const fs = require("node:fs");
const path = require("node:path");
const { execSync } = require("node:child_process");

const REPO = "xxwzh66-byte/huihua";
const VERSION = "1.17.0";
const TAG = `v${VERSION}`;
const BASE = "5d1b6a8"; // 上游 v1.16.0 树被导入时的基线提交
const ROOT = path.resolve(__dirname, "..");
const APK = path.join(ROOT, "dist-apk", `huihua-${VERSION}-arm64.apk`);
const NOTES = path.join(ROOT, "_build", `release-${VERSION}.md`);
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

const git = (cmd) => execSync(cmd, { cwd: ROOT, encoding: "utf8" }).trim();

function changes() {
  const nameOnly = git(`git diff --name-only ${BASE} HEAD`).split("\n").filter(Boolean);
  const deleted = new Set(
    git(`git diff --diff-filter=D --name-only ${BASE} HEAD`).split("\n").filter(Boolean),
  );
  return { nameOnly, deleted };
}

(async () => {
  const { nameOnly, deleted } = changes();
  const msg = [
    "feat(v1.17): 素材库全中文显示 + 中英日三路搜索 + 整套双路发送",
    "",
    git(`git log --format=%B ${BASE}..HEAD`).trim(),
  ].join("\n");

  console.log(`repo   ${REPO}`);
  console.log(`base   ${BASE} → 上游 main`);
  console.log(`files  ${nameOnly.length} 个改动（删 ${deleted.size}）`);
  for (const f of nameOnly) console.log(`  ${deleted.has(f) ? "D" : "M"} ${f}`);
  console.log(`apk    ${fs.existsSync(APK) ? APK : "缺失 → Release 将发成 draft"}`);

  if (DRY) {
    console.log("\n--dry-run：未写入。要真发布：GITHUB_TOKEN=... node _build/publish-1.17.0.cjs");
    return;
  }
  if (!TOKEN) throw new Error("没有 token：设 GITHUB_TOKEN，或在 git credential 里存一个 repo scope 的 PAT");

  // 1) 上游 main 当前指向
  const ref = await gh(`/repos/${REPO}/git/ref/heads/main`);
  const baseSha = ref.body.object.sha;
  const baseCommit = await gh(`/repos/${REPO}/git/commits/${baseSha}`);
  // GET /git/commits/{sha} 返回的是 git commit 对象本身：message / tree 都在顶层，
  // 没有 .commit 这一层（那是 /commits/{ref} 列表接口的形状）。
  console.log(
    `\nupstream main = ${baseSha.slice(0, 7)} (${String(baseCommit.body.message).split("\n")[0]})`,
  );

  const existing = await gh(`/repos/${REPO}/git/ref/tags/${TAG}`, {}, { allow: [404] });
  if (existing.status === 200) console.log(`注意：${TAG} 已存在（指向 ${existing.body.object.sha.slice(0, 7)}），将复用`);

  // 2) 上传改动文件为 blob
  const entries = [];
  for (const rel of nameOnly) {
    if (deleted.has(rel)) {
      entries.push({ path: rel, mode: "100644", type: "blob", sha: null });
      continue;
    }
    const abs = path.join(ROOT, rel);
    const content = fs.readFileSync(abs);
    const modeBits = git(`git ls-files -s -- "${rel}"`).split(/\s+/)[0] || "100644";
    const blob = await gh(`/repos/${REPO}/git/blobs`, {
      method: "POST",
      body: JSON.stringify({ content: content.toString("base64"), encoding: "base64" }),
    });
    entries.push({ path: rel, mode: modeBits, type: "blob", sha: blob.body.sha });
    console.log(`blob   ${blob.body.sha.slice(0, 7)} ${rel}`);
  }

  // 3) 建树（基于上游树，只替换改动项）
  const tree = await gh(`/repos/${REPO}/git/trees`, {
    method: "POST",
    body: JSON.stringify({ base_tree: baseCommit.body.tree.sha, tree: entries }),
  });
  console.log(`tree   ${tree.body.sha.slice(0, 7)}`);

  // 4) 建提交
  const commit = await gh(`/repos/${REPO}/git/commits`, {
    method: "POST",
    body: JSON.stringify({ message: msg, tree: tree.body.sha, parents: [baseSha] }),
  });
  console.log(`commit ${commit.body.sha.slice(0, 7)}`);

  // 5) fast-forward main（不 force）
  const upd = await gh(`/repos/${REPO}/git/refs/heads/main`, {
    method: "PATCH",
    body: JSON.stringify({ sha: commit.body.sha, force: false }),
  });
  console.log(`main   ${upd.status} → ${commit.body.sha.slice(0, 7)}`);

  // 6) Release（tag 由 target_commitish 自动创建）
  const body = fs.readFileSync(NOTES, "utf8").trim();
  const asset = `huihua-${VERSION}-arm64.apk`;
  const hasApk = fs.existsSync(APK);
  const payload = {
    tag_name: TAG,
    target_commitish: commit.body.sha,
    name: `绘画 ${TAG}`,
    body,
    draft: !hasApk,
    prerelease: false,
  };

  let rel = await gh(`/repos/${REPO}/releases/tags/${TAG}`, {}, { allow: [404] });
  if (rel.status === 404) {
    rel = await gh(`/repos/${REPO}/releases`, { method: "POST", body: JSON.stringify(payload) });
    console.log(`release create ${rel.status} id=${rel.body.id} draft=${rel.body.draft}`);
  } else {
    rel = await gh(`/repos/${REPO}/releases/${rel.body.id}`, {
      method: "PATCH",
      body: JSON.stringify({ name: payload.name, body, draft: payload.draft, prerelease: false }),
    });
    console.log(`release update ${rel.status} id=${rel.body.id} draft=${rel.body.draft}`);
  }

  if (!hasApk) {
    console.log(`\n没有 APK：Release 以 draft 保留。出包后放回 ${APK} 再跑一次本脚本即自动上传并转正。`);
    return;
  }

  for (const a of rel.body.assets || []) {
    if (a.name === asset) {
      const del = await gh(`/repos/${REPO}/releases/assets/${a.id}`, { method: "DELETE" });
      console.log(`asset delete old ${del.status}`);
    }
  }
  const buf = fs.readFileSync(APK);
  const up = await fetch(
    `https://uploads.github.com/repos/${REPO}/releases/${rel.body.id}/assets?name=${asset}`,
    {
      method: "POST",
      headers: { ...H, "Content-Type": "application/vnd.android.package-archive" },
      body: buf,
    },
  );
  const upBody = await up.json().catch(() => ({}));
  console.log(`upload ${up.status} ${upBody.name} ${upBody.size} ${upBody.digest || ""}`);

  const check = await gh(`/repos/${REPO}/releases/tags/${TAG}`);
  const a = (check.body.assets || []).find((x) => x.name === asset);
  console.log(`final  ${check.body.tag_name} draft=${check.body.draft} asset=${a && a.size} ${a && a.digest}`);
})();
