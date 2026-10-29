import fs from "node:fs";

const wanted = [
  "缩小",
  "放大",
  "点击节点查看并修改参数。",
  "关闭参数",
  "不可用",
  "未选择",
  "{0} · 节点 {1}",
  "选择工作流",
  "工作流命名",
  "未命名工作流",
  "Choisir un preset",
  "Enregistrement automatique",
  "Chaque image générée rejoint la galerie de l’appareil",
  "Ce choix s’applique pour cette session ; l’enregistrement est indisponible.",
  "ComfyUI refuse ces valeurs : {0}. Choisissez une valeur proposée par votre serveur.",
  "(vide)",
];

for (const file of ["src/locales/zh-CN.json", "src/locales/en.json"]) {
  const data = JSON.parse(fs.readFileSync(file, "utf8"));
  const missing = wanted.filter((key) => !(key in data));
  console.log(file, "missing:", JSON.stringify(missing));
}
