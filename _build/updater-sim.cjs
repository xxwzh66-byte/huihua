const https = require("node:https");

function get(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers: { "User-Agent": "huihua" } }, (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => resolve(JSON.parse(data)));
      })
      .on("error", reject);
  });
}

const RE = /^v(\d+)\.(\d+)\.(\d+)$/;
const REPO = "xxwzh66-byte/huihua";

function cmp(a, b) {
  for (let i = 0; i < 3; i += 1) {
    const d = a[i] - b[i];
    if (d) return d;
  }
  return 0;
}

// Mirrors AppUpdates.kt check()
function check(releases, installed) {
  let best = null;
  for (const r of releases) {
    if (r.draft || r.prerelease) continue;
    const m = RE.exec(r.tag_name);
    if (!m) continue;
    const v = [+m[1], +m[2], +m[3]];
    if (cmp(v, installed) <= 0) continue;
    const tag = r.tag_name;
    const expected = "huihua-" + tag.slice(1) + "-arm64.apk";
    const url = "https://github.com/" + REPO + "/releases/download/" + tag + "/" + expected;
    const asset = (r.assets || []).find((a) => a.name === expected && a.browser_download_url === url);
    if (!asset) continue;
    const sha = String(asset.digest || "").replace(/^sha256:/, "");
    if (!/^[0-9a-f]{64}$/.test(sha)) continue;
    if (!(asset.size >= 1 && asset.size <= 250_000_000)) continue;
    const cand = {
      version: tag.slice(1),
      url: asset.browser_download_url,
      sha256: sha,
      size: asset.size,
      notes: String(r.body || "").slice(0, 20_000),
      title: r.name,
      published: r.published_at,
      page: r.html_url,
    };
    if (!best || cmp(v, best.v) > 0) best = { v, cand };
  }
  return best ? best.cand : null;
}

(async () => {
  const releases = await get("https://api.github.com/repos/" + REPO + "/releases?per_page=20");
  for (const installed of [[1, 1, 1], [1, 1, 0], [1, 0, 0]]) {
    const out = check(releases, installed);
    const label = installed.join(".");
    if (!out) {
      console.log("installed " + label + " → no update");
      continue;
    }
    console.log("installed " + label + " → " + out.version + " | " + out.size + " B | " + out.title);
    console.log("   url:     " + out.url);
    console.log("   sha256:  " + out.sha256);
    console.log("   page:    " + out.page);
    console.log("   notes:   " + out.notes.split("\n").filter(Boolean).slice(0, 3).join(" / "));
  }
})();
