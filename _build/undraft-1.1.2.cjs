const { execSync } = require("node:child_process");

const REPO = "xxwzh66-byte/huihua";
const TAG = "v1.1.2";

const out = execSync("git credential fill", {
  input: "protocol=https\nhost=github.com\n\n",
  encoding: "utf8",
});
const TOKEN = out.match(/^password=(.+)$/m)[1].trim();
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
  const list = await gh(`/repos/${REPO}/releases?per_page=20`);
  if (!Array.isArray(list.body)) throw new Error(JSON.stringify(list.body));
  const rel = list.body.find((r) => r.tag_name === TAG);
  if (!rel) throw new Error("no release for " + TAG);
  console.log("found:", rel.id, rel.tag_name, "draft=", rel.draft);

  if (rel.draft) {
    const patch = await gh(`/repos/${REPO}/releases/${rel.id}`, {
      method: "PATCH",
      body: JSON.stringify({ draft: false, prerelease: false }),
    });
    console.log("published:", patch.status, patch.body.draft, patch.body.published_at);
  }

  const after = await gh(`/repos/${REPO}/releases?per_page=20`);
  const done = after.body.find((r) => r.tag_name === TAG);
  const asset = (done.assets || []).find((a) => a.name === "huihua-1.1.2-arm64.apk");
  console.log("final:", done.tag_name, done.name, "draft=", done.draft, "prerelease=", done.prerelease);
  console.log("asset:", asset && asset.name, asset && asset.size, asset && asset.digest);
  console.log("url:", asset && asset.browser_download_url);
  console.log("page:", done.html_url);
  console.log("notes:", (done.body || "").slice(0, 60).replace(/\n/g, " "));
})();
