import fs from "node:fs";
import path from "node:path";

const dir = "src";
const files = fs.readdirSync(dir).filter((f) => /\.(ts|tsx)$/.test(f));
const found = new Set();
const re = /(?:\btr?\(\s*)("(?:[^"\\]|\\.)*")/g;
for (const file of files) {
  const text = fs.readFileSync(path.join(dir, file), "utf8");
  let m;
  while ((m = re.exec(text))) {
    try {
      found.add(JSON.parse(m[1]));
    } catch {}
  }
}
const zh = JSON.parse(fs.readFileSync("src/locales/zh-CN.json", "utf8"));
const en = JSON.parse(fs.readFileSync("src/locales/en.json", "utf8"));
const missing = [...found].filter((k) => !(k in zh) || !(k in en)).sort();
console.log("total literals", found.size, "missing", missing.length);
fs.writeFileSync("_build/missing-strings.json", JSON.stringify(missing, null, 2));
for (const k of missing.slice(0, 400)) console.log(JSON.stringify(k), k in zh ? "zh" : "", k in en ? "en" : "");
