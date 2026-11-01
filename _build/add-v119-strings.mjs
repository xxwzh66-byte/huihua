import fs from "node:fs";
import path from "node:path";

const dir = "D:/demo/Paint-v1/src/locales";
const entries = {
  "简体中文": ["简体中文", "简体中文"],
  "Blanc pur": ["纯白", "Pure white"],
  "Papier chaud": ["暖纸", "Warm paper"],
  "Menthe": ["薄荷", "Mint"],
  "Encre douce": ["淡墨", "Soft ink"],
  "Nuit": ["夜色", "Night"],
  "Supprimer": ["删除", "Delete"],
  "Supprimer du résultat": ["删除此结果", "Delete this result"],
  "Rafraîchissement automatique": [
    "生成完成后自动刷新图库",
    "Refresh the gallery when a render finishes",
  ],
};

for (const file of ["zh-CN.json", "en.json"]) {
  const full = path.join(dir, file);
  const data = JSON.parse(fs.readFileSync(full, "utf8"));
  let added = 0;
  for (const [key, value] of Object.entries(entries)) {
    if (data[key] !== undefined) continue;
    data[key] = file === "zh-CN.json" ? value[0] : value[1];
    added += 1;
  }
  const sorted = {};
  for (const key of Object.keys(data).sort((a, b) => a.localeCompare(b)))
    sorted[key] = data[key];
  fs.writeFileSync(full, JSON.stringify(sorted, null, 2) + "\n", "utf8");
  console.log(`${file}: added ${added}, total ${Object.keys(sorted).length}`);
}
