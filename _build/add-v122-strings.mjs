import { readFileSync, writeFileSync } from "node:fs";

// v1.22: the quick-nav labels now match the sections the studio really has.
const entries = [
  ["Workflow", "工作流", "Workflow"],
  ["Prompts", "提示词", "Prompts"],
];

const files = [
  ["src/locales/zh-CN.json", 1],
  ["src/locales/en.json", 2],
];

for (const [file, column] of files) {
  const path = new URL(`../${file}`, import.meta.url);
  const dict = JSON.parse(readFileSync(path, "utf8"));
  let added = 0;
  for (const [source, zh, en] of entries) {
    if (dict[source] !== undefined) continue;
    dict[source] = column === 1 ? zh : en;
    added += 1;
  }
  const sorted = {};
  for (const key of Object.keys(dict).sort()) sorted[key] = dict[key];
  writeFileSync(path, `${JSON.stringify(sorted, null, 2)}\n`, "utf8");
  console.log(`${file}: added ${added}, total ${Object.keys(sorted).length}`);
}
