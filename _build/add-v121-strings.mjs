import { readFileSync, writeFileSync } from "node:fs";

const files = ["src/locales/zh-CN.json", "src/locales/en.json"];

// [source, zh, en] — the source string is the key used by t()/tr().
const entries = [
  ["Texte invalide (1 à 5 000 caractères)", "文本无效（1 到 5000 个字符）", "Invalid text (1 to 5000 characters)"],
  ["Configurez d’abord une API de génération dans les réglages.", "请先在设置里配置生成 API。", "Configure a generation API in the settings first."],
  ["L’API n’a rien renvoyé.", "API 没有返回内容。", "The API returned nothing."],
  ["Appareil", "本机", "Device"],
  ["API", "API", "API"],
  ["Automatique", "自动", "Automatic"],
  ["Moteur", "引擎", "Engine"],
  ["L’API traduit le texte et laisse les tags, poids et <lora:…> intacts. Elle utilise l’API de génération configurée dans les réglages.", "API 只翻译自然语言，标签、权重和 <lora:…> 原样保留。它使用设置里配置的生成 API。", "The API translates the prose and leaves tags, weights and <lora:…> untouched. It uses the generation API configured in the settings."],
  ["L’appareil d’abord, l’API en secours. Sur ordinateur l’appareil n’existe pas : l’API prend le relais.", "先试本机，失败则走 API。电脑上没有本机引擎，会自动走 API。", "Device first, API as a fallback. Desktops have no device engine, so the API takes over."],
  ["via {0}", "经由 {0}", "via {0}"],
  ["Modèle sans titre", "未命名模板", "Untitled template"],
  ["Modèle introuvable.", "找不到这个模板。", "Template not found."],
  ["copie", "副本", "copy"],
  ["Aucun modèle à exporter.", "没有可导出的模板。", "No template to export."],
  ["Ce fichier n’est pas du JSON.", "这个文件不是 JSON。", "That file is not JSON."],
  ["Aucun modèle valide dans ce fichier.", "文件里没有有效模板。", "No valid template in that file."],
  ["Ces modèles existent déjà.", "这些模板已经存在。", "Those templates already exist."],
  ["Un modèle = une instruction d’API nommée. Il est enregistré sur cet appareil et peut être exporté pour un autre.", "一个模板就是一份命名过的 API 指令。它保存在这台设备上，也可以导出带走。", "A template is a named API instruction. It lives on this device and can be exported."],
  ["Nom du nouveau modèle", "新模板名称", "New template name"],
  ["新建", "新建", "New"],
  ["保存", "保存", "Save"],
  ["重命名", "重命名", "Rename"],
  ["Mon modèle", "我的模板", "My template"],
  ["Modèle « {0} » créé.", "已创建模板「{0}」。", "Template “{0}” created."],
  ["Nom enregistré.", "名称已保存。", "Name saved."],
  ["Modèle supprimé.", "模板已删除。", "Template deleted."],
  ["{0} modèles exportés.", "已导出 {0} 个模板。", "{0} template(s) exported."],
  ["{0} modèles importés.", "已导入 {0} 个模板。", "{0} template(s) imported."],
  ["Modèle « {0} » sélectionné.", "已选择模板「{0}」。", "Template “{0}” selected."],
  ["Aucun modèle pour l’instant. Créez-en un ci-dessus, ou importez un dossier skill.", "还没有模板。可以在上面新建一个，或者导入 skill 文件夹。", "No template yet. Create one above, or import a skill folder."],
  ["导出全部", "导出全部", "Export all"],
  ["导入 JSON", "导入 JSON", "Import JSON"],
  ["{0} 个可用", "{0} 个可用", "{0} available"],
  ["{0} 条", "{0} 条", "{0} entries"],
  ["未使用", "未使用", "None"],
  ["管理", "管理", "Manage"],
  ["Traduire le prompt", "翻译提示词", "Translate the prompt"],
  ["翻译成英文", "翻译成英文", "Translate to English"],
  ["翻译", "翻译", "Translate"],
  ["译文已替换画面描述。", "译文已替换画面描述。", "The translation replaced the scene description."],
  ["译文已替换生成的提示词。", "译文已替换生成的提示词。", "The translation replaced the generated prompt."],
];

for (const file of files) {
  const data = JSON.parse(readFileSync(file, "utf8"));
  const before = Object.keys(data).length;
  let added = 0;
  for (const [source, zh, en] of entries) {
    const value = file.includes("zh-CN") ? zh : en;
    if (!(source in data)) {
      data[source] = value;
      added++;
    }
  }
  const sorted = Object.fromEntries(
    Object.keys(data)
      .sort()
      .map((key) => [key, data[key]]),
  );
  writeFileSync(file, JSON.stringify(sorted, null, 2) + "\n", "utf8");
  console.log(`${file} added ${added} total ${before + added}`);
}
