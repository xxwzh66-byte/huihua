// 对比：本地 HEAD 的文件 blob sha vs 上游 main 的 blob sha，找出「上游已改过」的冲突项。
const { execSync } = require("node:child_process");
const path = require("node:path");
const ROOT = path.resolve(__dirname, "..");
const REPO = "xxwzh66-byte/huihua";
const BASE = "5d1b6a8";
const git = (c) => execSync(c, { cwd: ROOT, encoding: "utf8" }).trim();

(async () => {
  const res = await fetch(`https://api.github.com/repos/${REPO}/git/trees/main?recursive=1`, {
    headers: { Accept: "application/vnd.github+json", "User-Agent": "huihua-probe" },
  });
  const tree = await res.json();
  if (!res.ok) throw new Error(`${res.status} ${JSON.stringify(tree).slice(0, 200)}`);
  const upstream = new Map();
  for (const e of tree.tree || []) if (e.type === "blob") upstream.set(e.path, e.sha);

  const changed = git(`git diff --name-only ${BASE} HEAD`).split("\n").filter(Boolean);
  let same = 0, upstreamMoved = 0;
  for (const f of changed) {
    const local = git(`git rev-parse HEAD:${f}`);
    let baseSha = null;
    try {
      baseSha = git(`git rev-parse ${BASE}:${f}`);
    } catch {
      baseSha = null; // baseline 里没有这个文件 → 本次是新增
    }
    const up = upstream.get(f) ?? null;
    if (up === local) { same++; continue; }
    if (up !== baseSha) {
      upstreamMoved++;
      const tag = (s) => (s ? s.slice(0, 7) : "(none)");
      console.log(`CONFLICT ${f}  baseline=${tag(baseSha)} upstream=${tag(up)} local=${tag(local)}`);
    }
  }
  console.log(`changed=${changed.length} identical-to-upstream=${same} upstream-moved=${upstreamMoved}`);
})();
