import fs from "node:fs";

const DIR = "D:/demo/Paint-v1/src/locales";
const files = { zh: "zh-CN.json", en: "en.json" };

// [key (source string passed to t()), zh-CN, en]
const entries = [
  ["Modifier", "编辑", "Edit"],
  ["Fin de l’édition", "结束编辑", "Done editing"],
  ["Rétablir", "还原", "Restore"],
  ["Copier tout", "复制全部", "Copy all"],
  ["Envoyer à l’atelier", "写回工坊", "Send to the studio"],
  [
    "修改只影响这里的复制内容，不会改写图片文件。",
    "修改只影响这里的复制内容，不会改写图片文件。",
    "Edits only change what you copy here — the image file is never modified.",
  ],
  ["提示词已写回工坊。", "提示词已写回工坊。", "The prompt is back in the studio."],
];

for (const [name, file] of Object.entries(files)) {
  const path = `${DIR}/${file}`;
  const data = JSON.parse(fs.readFileSync(path, "utf8"));
  let added = 0;
  for (const [key, zh, en] of entries) {
    const value = name === "zh" ? zh : en;
    if (data[key] === value) continue;
    if (!(key in data)) added += 1;
    data[key] = value;
  }
  const sorted = {};
  for (const key of Object.keys(data).sort()) sorted[key] = data[key];
  fs.writeFileSync(path, JSON.stringify(sorted, null, 2) + "\n", "utf8");
  console.log(`${file}: added ${added}, total ${Object.keys(sorted).length}`);
}
