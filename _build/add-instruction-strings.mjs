import fs from "node:fs";
import path from "node:path";

const dir = "D:/demo/Paint-v1/src/locales";

/** [source, zh, en] */
const table = [
  [
    "Aucun modèle sélectionné : voici l’instruction par défaut, envoyée telle quelle avec chaque génération.",
    "未选择模板：这是默认指令，每次生成都会原样发送。",
    "No template selected: this is the default instruction, sent as-is with every generation.",
  ],
  [
    "Ce texte part vers l’API avec chaque génération. Modifiez-le librement : c’est enregistré sur cet appareil.",
    "这段文字会随每次生成发送给 API。可以随意修改，保存在本机。",
    "This text is sent to the API with every generation. Edit it freely — it stays on this device.",
  ],
  [
    "Impossible d’enregistrer ce modèle sur l’appareil.",
    "无法把该模板保存到本机。",
    "The template could not be saved on this device.",
  ],
  ["Instruction par défaut enregistrée.", "默认指令已保存。", "Default instruction saved."],
  ["Instruction par défaut rétablie.", "默认指令已恢复。", "Default instruction restored."],
  ["Modèle « {0} » enregistré.", "模板「{0}」已保存。", "Template “{0}” saved."],
  ["Modèle « {0} » vidé.", "模板「{0}」已清空。", "Template “{0}” cleared."],
  ["保存", "", "Save"],
  [
    "保存后立刻生效；模板列表会同步刷新。",
    "",
    "Takes effect as soon as it is saved; the template list refreshes too.",
  ],
  ["可用变量：", "", "Available variables:"],
  ["填入默认指令", "", "Use the default instruction"],
  ["实际发送内容", "", "What is actually sent"],
  [
    "已读取默认指令，保存后生效。",
    "",
    "The default instruction is loaded — save to apply it.",
  ],
  ["恢复默认", "", "Reset"],
  ["指令 / 系统提示词", "", "Instruction / system prompt"],
  ["收起注入模板", "", "Hide the injected template"],
  ["查看 / 修改注入模板", "", "View / edit the injected template"],
  ["模板结构（可用 {{变量}}）", "", "Template structure (use {{variables}})"],
];

for (const file of ["zh-CN.json", "en.json"]) {
  const target = path.join(dir, file);
  const data = JSON.parse(fs.readFileSync(target, "utf8"));
  for (const [source, zh, en] of table)
    data[source] = file === "zh-CN.json" ? zh || source : en || source;
  const sorted = {};
  for (const key of Object.keys(data).sort((a, b) => a.localeCompare(b)))
    sorted[key] = data[key];
  fs.writeFileSync(target, JSON.stringify(sorted, null, 2) + "\n", "utf8");
  console.log(file, Object.keys(sorted).length);
}
