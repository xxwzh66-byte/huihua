// 只读：把已发布 Release 的正文抓回来，确认「源码版」说明确实在页面上。
const fs = require("node:fs");
const path = require("node:path");
const REPO = "xxwzh66-byte/huihua";
const TAG = "v1.17.0";
const TOKEN = fs.readFileSync(path.join(__dirname, ".ghtoken"), "utf8").trim();

(async () => {
  const res = await fetch(`https://api.github.com/repos/${REPO}/releases/tags/${TAG}`, {
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": "huihua-release",
      Authorization: `Bearer ${TOKEN}`,
    },
  });
  const r = await res.json();
  console.log("name:", r.name, "| tag:", r.tag_name, "| draft:", r.draft, "| pre:", r.prerelease);
  console.log("published:", r.published_at, "| assets:", (r.assets || []).map((a) => a.name));
  console.log("--- body ---");
  console.log(r.body);
})();
