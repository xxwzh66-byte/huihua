const { execSync } = require("node:child_process");

function token() {
  const out = execSync("git credential fill", {
    input: "protocol=https\nhost=github.com\n\n",
    encoding: "utf8",
  });
  return out.match(/^password=(.+)$/m)[1].trim();
}

(async () => {
  const res = await fetch("https://api.github.com/repos/xxwzh66-byte/huihua/commits/main", {
    headers: { Authorization: `Bearer ${token()}`, Accept: "application/vnd.github+json", "User-Agent": "huihua" },
  });
  const b = await res.json();
  console.log("remote main:", b.sha, "|", (b.commit && b.commit.message || "").split("\n")[0]);
})();
