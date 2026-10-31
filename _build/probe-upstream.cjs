// 只读探测：确认 api.github.com 可达、上游 main 的 HEAD、已有 tag / release。
// 不写任何东西，不需要 token。
const REPO = "xxwzh66-byte/huihua";
const H = { Accept: "application/vnd.github+json", "User-Agent": "huihua-probe" };

async function gh(p) {
  const res = await fetch(`https://api.github.com${p}`, { headers: H });
  const body = await res.json().catch(() => null);
  return { status: res.status, body };
}

(async () => {
  const repo = await gh(`/repos/${REPO}`);
  console.log("repo", repo.status, repo.body?.default_branch, "pushed_at", repo.body?.pushed_at);

  const commits = await gh(`/repos/${REPO}/commits?per_page=3`);
  for (const c of commits.body || []) {
    console.log("commit", c.sha.slice(0, 7), c.commit.message.split("\n")[0]);
  }

  const rels = await gh(`/repos/${REPO}/releases?per_page=3`);
  for (const r of rels.body || []) {
    console.log("release", r.tag_name, "draft:", r.draft, (r.assets || []).map((a) => a.name).join(","));
  }

  const tag = await gh(`/repos/${REPO}/git/ref/tags/v1.17.0`);
  console.log("tag v1.17.0", tag.status);
})();
