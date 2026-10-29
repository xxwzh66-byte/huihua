// v1.15 locale additions. Key = the French source string used in code.
// Value = [zh-CN, en]. Keeps both locale files in sync and sorted.
import { readFileSync, writeFileSync } from "node:fs";

const FILE = new Map([
  ["zh-CN", "src/locales/zh-CN.json"],
  ["en", "src/locales/en.json"],
]);

const ADD = [
  ["Garde-robe", ["素材库", "Wardrobe"]],
  ["La garde-robe.", ["素材库。", "The wardrobe."]],
  [
    "Tenues, poses, décors et expressions, prêts à cliquer.",
    [
      "服装、姿势、场景、表情，点一下就能用。",
      "Outfits, poses, scenes and expressions, one tap away.",
    ],
  ],
  ["Ouverture de la bibliothèque", ["正在打开素材库", "Opening the library"]],
  ["Ouvrir la garde-robe", ["打开素材库", "Open the wardrobe"]],
  [
    "Rechercher dans la bibliothèque",
    ["在素材库中搜索", "Search the library"],
  ],
  [
    "Chercher une tenue, une pose, une ambiance…",
    [
      "搜索服装、姿势、氛围…",
      "Search an outfit, a pose, a mood…",
    ],
  ],
  ["Ensembles", ["套装", "Sets"]],
  ["Choisissez vos tags", ["选择标签", "Pick your tags"]],
  ["Aucun ensemble trouvé", ["没有找到套装", "No set found"]],
  ["+{0} tags", ["+{0} 个标签", "+{0} tags"]],
  [
    "{0} · {1} ensembles · {2} tags",
    ["{0} · {1} 个套装 · {2} 个标签", "{0} · {1} sets · {2} tags"],
  ],
  [
    "{0} tags · hors ligne · source Comfyui-Anima-Wardrobe",
    [
      "{0} 个标签 · 离线 · 来源 Comfyui-Anima-Wardrobe",
      "{0} tags · offline · from Comfyui-Anima-Wardrobe",
    ],
  ],
  ["Tenues, matières et accessoires", ["服装、材质与配饰", "Outfits, fabrics and accessories"]],
  ["Lieux, moments et atmosphères", ["地点、时刻与氛围", "Places, moments and moods"]],
  ["Attitudes, gestes et compositions", ["姿态、手势与构图", "Attitudes, gestures and framing"]],
  ["Visages, intensités et réactions", ["神情、强度与反应", "Faces, intensity and reactions"]],
];

for (const [locale, path] of FILE) {
  const data = JSON.parse(readFileSync(path, "utf8"));
  const before = Object.keys(data).length;
  for (const [key, values] of ADD) {
    data[key] = locale === "zh-CN" ? values[0] : values[1];
  }
  const sorted = {};
  for (const key of Object.keys(data).sort((a, b) => a.localeCompare(b)))
    sorted[key] = data[key];
  writeFileSync(path, JSON.stringify(sorted, null, 2) + "\n", "utf8");
  console.log(
    `${locale}: ${before} -> ${Object.keys(sorted).length} keys`,
  );
}
