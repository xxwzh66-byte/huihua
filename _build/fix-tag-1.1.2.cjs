const { execSync } = require("node:child_process");

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
const REPO = "xxwzh66-byte/huihua";

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
  const head = await gh(`/repos/${REPO}/commits/main`);
  console.log("remote head:", head.body.sha, (head.body.commit?.message || "").split("\n")[0]);

  const tag = await gh(`/repos/${REPO}/git/ref/tags/v1.1.2`);
  console.log("tag ref:", tag.status, tag.body?.object?.sha, tag.body?.object?.type);

  if (tag.body?.object?.sha !== head.body.sha) {
    const del = await gh(`/repos/${REPO}/git/refs/tags/v1.1.2`, { method: "DELETE" });
    console.log("delete tag:", del.status);
    const create = await gh(`/repos/${REPO}/git/refs`, {
      method: "POST",
      body: JSON.stringify({ ref: "refs/tags/v1.1.2", sha: head.body.sha }),
    });
    console.log("recreate tag:", create.status, create.body?.object?.sha);
  }

  const rel = await gh(`/repos/${REPO}/releases/tags/v1.1.2`);
  const asset = (rel.body.assets || []).find((a) => a.name === "huihua-1.1.2-arm64.apk");
  console.log("release:", rel.body.tag_name, rel.body.name, "asset:", asset?.size, asset?.digest);
  console.log("notes head:", (rel.body.body || "").slice(0, 40).replace(/\n/g, " "));
})();
