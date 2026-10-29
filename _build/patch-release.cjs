const fs = require("node:fs");
const { execSync } = require("node:child_process");

const REPO = "xxwzh66-byte/huihua";
const TAG = "v1.1.1";

function token() {
  const out = execSync("git credential fill", {
    input: "protocol=https\nhost=github.com\n\n",
    encoding: "utf8",
  });
  const m = out.match(/^password=(.+)$/m);
  if (!m) throw new Error("no token");
  return m[1].trim();
}

(async () => {
  const body = fs.readFileSync("D:/demo/Paint-v1/_build/release-1.1.1.md", "utf8").trim();
  const res = await fetch(`https://api.github.com/repos/${REPO}/releases/tags/${TAG}`, {
    headers: { Authorization: `Bearer ${token()}`, Accept: "application/vnd.github+json", "User-Agent": "huihua" },
  });
  const rel = await res.json();
  const patch = await fetch(`https://api.github.com/repos/${REPO}/releases/${rel.id}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token()}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "huihua",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ name: "绘画 v1.1.1", body }),
  });
  const out = await patch.json();
  console.log("patch", patch.status, out.tag_name, out.name, (out.body || "").split("\n")[0]);
  console.log("assets", (out.assets || []).map((a) => `${a.name} ${a.size} ${a.digest}`).join(" | "));
})();
