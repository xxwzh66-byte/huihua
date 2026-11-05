import { readFileSync, writeFileSync } from "node:fs";

// v1.24: project link row, plus the removal of the "full release" link.
const entries = [
  ["Projet sur GitHub", "GitHub 项目地址", "Project on GitHub"],
  ["Ouvrir", "打开", "Open"],
  [
    "Ouvrir le dépôt dans le navigateur",
    "在浏览器中打开项目仓库",
    "Open the repository in your browser",
  ],
  [
    "Adresse copiée dans le presse-papiers.",
    "地址已复制到剪贴板。",
    "Address copied to the clipboard.",
  ],
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
  // The "see the full release" anchor is gone, so its wording is dead weight.
  for (const dead of ["Voir la publication complète"]) {
    if (dict[dead] === undefined) continue;
    delete dict[dead];
    added -= 1;
  }
  const sorted = {};
  for (const key of Object.keys(dict).sort()) sorted[key] = dict[key];
  writeFileSync(path, `${JSON.stringify(sorted, null, 2)}\n`, "utf8");
  console.log(`${file}: net ${added >= 0 ? "+" : ""}${added}, total ${Object.keys(sorted).length}`);
}
