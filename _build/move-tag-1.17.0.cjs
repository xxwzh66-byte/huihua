/**
 * 把 tag v1.17.0 平移到当前 main HEAD（签名修复提交），让 Release 页指向真正的发版代码。
 *
 * 为什么需要：Release 是先前那台机器用 Git Data API 先建的 tag，指向 f73df49；
 * 签名修复提交 3daaa9d 之后到，tag 不会自动跟上。
 *
 *   node _build/move-tag-1.17.0.cjs            # 真跑
 *   node _build/move-tag-1.17.0.cjs --dry-run  # 只看计划
 */
const { execSync } = require("node:child_process");

const REPO = "xxwzh66-byte/huihua";
const TAG = "v1.17.0";
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

(async () => {
  const local = execSync("git rev-parse HEAD", {
    cwd: require("node:path").resolve(__dirname, ".."),
    encoding: "utf8",
  }).trim();
  const mainRef = await gh(`/repos/${REPO}/git/ref/heads/main`);
  const tagRef = await gh(`/repos/${REPO}/git/ref/tags/${TAG}`, {}, { allow: [404] });

  console.log(`local HEAD   ${local}`);
  console.log(`remote main  ${mainRef.body.object.sha}`);
  console.log(`tag ${TAG}  ${tagRef.status === 200 ? tagRef.body.object.sha : "（不存在）"}`);

  if (mainRef.body.object.sha !== local) {
    throw new Error("远端 main 与本地 HEAD 不一致，先 push 再说");
  }
  if (tagRef.status === 200 && tagRef.body.object.sha === local) {
    console.log("tag 已指向 HEAD，无需操作");
    return;
  }
  if (DRY) {
    console.log(`\n--dry-run：会把 ${TAG} 从 ${tagRef.body?.object?.sha?.slice(0, 7)} 移到 ${local.slice(0, 7)}`);
    return;
  }

  const move = await gh(`/repos/${REPO}/git/refs/tags/${TAG}`, {
    method: "PATCH",
    body: JSON.stringify({ sha: local, force: true }),
  });
  console.log(`tag move → ${move.status} ${move.body.object.sha}`);

  // Release 的 tag_name 未变，GitHub 会自动跟随新 commit；这里只确认一下正文和资产还在。
  const rel = await gh(`/repos/${REPO}/releases/tags/${TAG}`);
  console.log(`release ${rel.body.id} draft=${rel.body.draft} prerelease=${rel.body.prerelease}`);
  for (const a of rel.body.assets || []) {
    console.log(`  asset ${a.name} ${a.size} ${a.digest || ""}`);
  }
})();
