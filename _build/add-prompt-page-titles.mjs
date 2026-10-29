import fs from "node:fs";
import path from "node:path";

const dir = "D:/demo/Paint-v1/src/locales";
const table = [
  ["Le prompt juste.", "把话说清楚。", "The right words."],
  [
    "Une phrase, et l’API écrit les tags.",
    "一句话，API 写成标签。",
    "One sentence, and the API writes the tags.",
  ],
];

for (const file of ["zh-CN.json", "en.json"]) {
  const target = path.join(dir, file);
  const data = JSON.parse(fs.readFileSync(target, "utf8"));
  for (const [source, zh, en] of table)
    data[source] = file === "zh-CN.json" ? zh : en;
  const sorted = {};
  for (const key of Object.keys(data).sort((a, b) => a.localeCompare(b)))
    sorted[key] = data[key];
  fs.writeFileSync(target, JSON.stringify(sorted, null, 2) + "\n", "utf8");
  console.log(file, Object.keys(sorted).length);
}
