import fs from "node:fs";

const missing = JSON.parse(fs.readFileSync("_build/missing-strings.json", "utf8"));

// [source, zh-CN, en] — zh-CN is "" when the source string is already Chinese.
const table = [
  ["Copier", "复制", "Copy"],
  ["Des workflows à votre façon", "随心定义工作流", "Workflows your way"],
  ["Décrivez la scène", "描述画面", "Describe the scene"],
  ["Génération directe", "直接生成", "Direct generation"],
  ["Générer le prompt", "生成提示词", "Generate prompt"],
  [
    "Impossible d’enregistrer ce workflow sur l’appareil.",
    "无法在本机保存该工作流。",
    "Cannot save this workflow on this device.",
  ],
  [
    "La copie automatique est indisponible sur cet appareil.",
    "此设备无法自动复制。",
    "Automatic copy is unavailable on this device.",
  ],
  [
    "La génération a échoué. Votre saisie est conservée.",
    "生成失败，你的输入已保留。",
    "Generation failed. Your input is kept.",
  ],
  ["Prompt généré", "提示词已生成", "Prompt generated"],
  [
    "Une rue de Tokyo sous la pluie, néons roses, reflets sur l’asphalte…",
    "雨中的东京街头，粉色霓虹，柏油路上的倒影……",
    "A Tokyo street in the rain, pink neon, reflections on the asphalt…",
  ],
  [
    "Une seule réponse, en texte : copiez-la ou insérez-la dans le prompt.",
    "只返回一段纯文本：复制它或插入到提示词中。",
    "One text answer only: copy it or insert it into the prompt.",
  ],
  ["Workflow sans titre", "未命名工作流", "Untitled workflow"],
  ["{0} 个占位符", "", "{0} placeholders"],
  ["{0} 个参数已联动到自动设置。", "", "{0} parameter(s) linked to auto settings."],
  ["{0} 个节点", "", "{0} nodes"],
  ["{0} 已联动到自动设置。", "", "{0} linked to auto settings."],
  ["保存修改", "", "Save changes"],
  ["保存工作流", "", "Save workflow"],
  ["删除 {0}", "", "Delete {0}"],
  ["占位符 · {0}", "", "Placeholder · {0}"],
  ["占位符已解除。", "", "Placeholder removed."],
  ["可视化编辑", "", "Visual editing"],
  [
    "导入 ComfyUI 的 API 工作流后可以直接改参数。用占位符（如 {{sampler}}、{{prompt}}）把字段交给自动模式，生成时会自动填入。",
    "",
    "Edit an imported ComfyUI API workflow directly. Use placeholders (like {{sampler}}, {{prompt}}) to hand a field to auto mode; it is filled at generation time.",
  ],
  [
    "导入你自己在 ComfyUI 里搭好的 API 工作流：节点、模型和连线都保留，改完可以保存到本机。",
    "",
    "Import an API workflow you built in ComfyUI: nodes, models and links are kept, and your edits can be saved on this device.",
  ],
  ["导出", "", "Export"],
  [
    "工作流只保存在这台设备上，不会上传到任何服务器。",
    "",
    "Workflows stay on this device and are never uploaded.",
  ],
  ["工作流名称", "", "Workflow name"],
  ["工作流已保存到本机。", "", "Workflow saved on this device."],
  ["工作流已删除。", "", "Workflow deleted."],
  ["工作流已导入。", "", "Workflow imported."],
  ["工作流已导出为 JSON 文件。", "", "Workflow exported as a JSON file."],
  [
    "工作流按依赖顺序逐行展开，每个节点一张卡片，手机上也能看清每一项参数。",
    "",
    "Nodes unfold in dependency order, one card each, so every parameter stays readable on a phone.",
  ],
  ["已保存 {0} 个工作流", "", "{0} workflows saved"],
  ["已载入「{0}」。", "", "Loaded “{0}”."],
  ["我的工作流", "", "My workflows"],
  [
    "把这个参数交给自动模式：每次生成都会用自动设置里的值替换占位符。",
    "",
    "Hand this field to auto mode: every generation replaces the placeholder with the value from auto settings.",
  ],
  [
    "把采样器、步数、提示词换成占位符，工作流就会跟着自动模式的设置走。",
    "",
    "Turn the sampler, steps or prompt into placeholders and the workflow follows the auto settings.",
  ],
  ["提示词已写入工作流。", "", "Prompt written into the workflow."],
  ["没有输入项。", "", "No inputs."],
  ["绑定到自动设置", "", "Bind to auto settings"],
  ["编辑", "", "Edit"],
  ["编辑 {0}", "", "Edit {0}"],
  ["联动", "", "Link"],
  ["联动到自动设置", "", "Link to auto settings"],
  ["自动联动", "", "Auto link"],
  ["解除占位符", "", "Remove placeholder"],
  [
    "还没有保存的工作流。导入后点「保存工作流」即可留存。",
    "",
    "No saved workflows yet. Import one, then tap “Save workflow”.",
  ],
  ["这个工作流没有节点。", "", "This workflow has no nodes."],
];

const zh = JSON.parse(fs.readFileSync("src/locales/zh-CN.json", "utf8"));
const en = JSON.parse(fs.readFileSync("src/locales/en.json", "utf8"));

let added = 0;
for (const [source, zhText, enText] of table) {
  if (!(source in zh)) {
    zh[source] = zhText || source;
    added += 1;
  }
  if (!(source in en)) en[source] = enText;
}
const sortObj = (o) =>
  Object.fromEntries(Object.keys(o).sort((a, b) => a.localeCompare(b)).map((k) => [k, o[k]]));
fs.writeFileSync("src/locales/zh-CN.json", JSON.stringify(sortObj(zh), null, 2) + "\n");
fs.writeFileSync("src/locales/en.json", JSON.stringify(sortObj(en), null, 2) + "\n");
console.log("added", added, "zh", Object.keys(zh).length, "en", Object.keys(en).length);

const still = missing.filter((k) => !(k in zh) || !(k in en));
console.log("still missing", still.length, still.slice(0, 20));
