// Adds the v1.16 strings to both locale files. Key = the French source string,
// value = [zh-CN, en]. Rewrites each JSON sorted by key.
import fs from "node:fs";
import path from "node:path";

const root = "D:\\demo\\Paint-v1\\src\\locales";
const entries = {
  "Nœud {0}": ["节点 {0}", "Node {0}"],
  "Prompt détaillé": ["详细提示词", "Detailed prompt"],
  "Voir le prompt détaillé": ["查看详细提示词", "View the detailed prompt"],
  "Lecture des métadonnées…": ["正在读取元数据…", "Reading metadata…"],
  "Impossible de lire les métadonnées de cette image.": [
    "无法读取这张图片的元数据。",
    "Cannot read this image’s metadata.",
  ],
  "Aucun prompt positif dans cette image.": [
    "这张图片里没有正面提示词。",
    "No positive prompt inside this image.",
  ],
  "Sampler": ["采样器", "Sampler"],
  "Scheduler": ["调度器", "Scheduler"],
  "Graîne": ["种子", "Seed"],
  "LoRAs": ["LoRA", "LoRAs"],
  "VAE": ["VAE", "VAE"],
  "Taille": ["尺寸", "Size"],
  "Source": ["来源", "Source"],
  "Send to the scene description": [
    "发送到画面描述",
    "Send to the scene description",
  ],
  "素材已作为画面描述填入。": [
    "素材已作为画面描述填入。",
    "The wardrobe selection is now the scene description.",
  ],
  "素材已发送到画面描述。": [
    "素材已发送到画面描述。",
    "Sent to the scene description.",
  ],
};

for (const [file, index] of [
  ["zh-CN.json", 0],
  ["en.json", 1],
]) {
  const full = path.join(root, file);
  const data = JSON.parse(fs.readFileSync(full, "utf8"));
  let added = 0;
  for (const [key, values] of Object.entries(entries)) {
    if (data[key] === undefined) added++;
    data[key] = values[index];
  }
  const sorted = {};
  for (const key of Object.keys(data).sort()) sorted[key] = data[key];
  fs.writeFileSync(full, JSON.stringify(sorted, null, 2) + "\n", "utf8");
  console.log(file, "added", added, "total", Object.keys(sorted).length);
}
