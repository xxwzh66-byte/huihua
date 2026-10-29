import fs from "node:fs";

// v1.14: new UI copy. Key = French source string used with tr(); values are
// [zh-CN, en]. i18n falls back to the key itself, so a missing entry is a
// visible French string on a Chinese phone — that is the bug this fixes.
const add = {
  "缩小": ["缩小", "Zoom out"],
  "放大": ["放大", "Zoom in"],
  "适应宽度": ["适应宽度", "Fit width"],
  "点击节点查看并修改参数。": [
    "点击节点查看并修改参数。",
    "Tap a node to view and edit its parameters.",
  ],
  "关闭参数": ["关闭参数", "Close parameters"],
  "不可用": ["不可用", "unavailable"],
  "未选择": ["未选择", "Not set"],
  "{0} · 节点 {1}": ["{0} · 节点 {1}", "{0} · node {1}"],
  "选择工作流": ["选择工作流", "Choose a workflow"],
  "工作流命名": ["工作流命名", "Workflow name"],
  "未命名工作流": ["未命名工作流", "Untitled workflow"],
  "Choisir un preset": ["选择预设", "Choose a preset"],
  "Enregistrement automatique": ["默认保存", "Automatic saving"],
  "Chaque image générée rejoint la galerie de l’appareil": [
    "每张生成的图片自动存入手机相册",
    "Every generated image is saved to the device gallery",
  ],
  "ComfyUI refuse ces valeurs : {0}. Choisissez une valeur proposée par votre serveur.": [
    "ComfyUI 拒绝这些取值：{0}。请改选服务器提供的值。",
    "ComfyUI rejects these values: {0}. Pick a value your server offers.",
  ],
  "(vide)": ["（空）", "(empty)"],
};

for (const [file, index] of [
  ["src/locales/zh-CN.json", 0],
  ["src/locales/en.json", 1],
]) {
  const data = JSON.parse(fs.readFileSync(file, "utf8"));
  let added = 0;
  for (const [key, values] of Object.entries(add)) {
    if (!(key in data)) {
      data[key] = values[index];
      added++;
    }
  }
  const sorted = {};
  for (const key of Object.keys(data).sort()) sorted[key] = data[key];
  fs.writeFileSync(file, JSON.stringify(sorted, null, 2) + "\n");
  console.log(file, "added", added, "total", Object.keys(sorted).length);
}
