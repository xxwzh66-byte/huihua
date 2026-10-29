import fs from "node:fs";
import path from "node:path";

const dir = "D:/demo/Paint-v1/src";
const files = fs.readdirSync(dir);
const modules = files.filter(
  (f) => (f.endsWith(".ts") || f.endsWith(".tsx")) && !f.endsWith(".test.ts") && f !== "main.tsx",
);

function readAll() {
  return files
    .filter((f) => f.endsWith(".ts") || f.endsWith(".tsx"))
    .map((f) => ({ f, text: fs.readFileSync(path.join(dir, f), "utf8") }));
}

const all = readAll();

for (const m of modules) {
  const base = m.replace(/\.tsx?$/, "");
  let count = 0;
  for (const { f, text } of all) {
    if (f === m) continue;
    const re = new RegExp(`from\\s+"\\./${base}"`, "g");
    const re2 = new RegExp(`import\\(" \\./${base}"`, "g");
    count += (text.match(re) || []).length;
    count += (text.match(new RegExp(`import\\(\"\\./${base}\"\\)`, "g")) || []).length;
  }
  if (count === 0) console.log("ORPHAN:", m);
}
