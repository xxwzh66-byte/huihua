const fs = require("node:fs");
const { execSync } = require("node:child_process");

const REPO = "xxwzh66-byte/huihua";
const TAG = "v1.1.3";
const NOTES = "D:/demo/Paint-v1/_build/release-1.1.3.md";

const out = execSync("git credential fill", {
  input: "protocol=https\nhost=github.com\n\n",
  encoding: "utf8",
});
const TOKEN = out.match(/^password=(.+)$/m)[1].trim();
const H = {
  Authorization: `Bearer ${TOKEN}`,
  Accept: "application/vnd.github+json",
  "User-Agent": "huihua-release",
  "Content-Type": "application/json",
};

(async () => {
  const body = fs.readFileSync(NOTES, "utf8").trim();
  const list = await (
    await fetch(`https://api.github.com/repos/${REPO}/releases?per_page=20`, { headers: H })
  ).json();
  const rel = list.find((r) => r.tag_name === TAG);
  if (!rel) throw new Error("release not found");
  const upd = await fetch(`https://api.github.com/repos/${REPO}/releases/${rel.id}`, {
    method: "PATCH",
    headers: H,
    body: JSON.stringify({ name: `绘画 ${TAG}`, body, draft: false, prerelease: false }),
  });
  const json = await upd.json();
  console.log("patch", upd.status, json.tag_name, (json.body || "").length);
})();
