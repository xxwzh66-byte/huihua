import fs from "node:fs";

const add = {
  "API de génération": ["生成 API", "Generation API"],
  "API de génération enregistrée.": ["生成 API 已保存。", "Generation API saved."],
  "Adresse de l’API": ["API 地址", "API address"],
  "Agrandir le zoom": ["放大", "Zoom in"],
  "Assistant de prompt": ["提示词助手", "Prompt assistant"],
  "Assistant de prompt et modèles skill": [
    "提示词助手与 skill 模板",
    "Prompt assistant and skill templates",
  ],
  "Aucun LoRA actif": ["无启用的 LoRA", "No active LoRA"],
  "Aucun fichier sélectionné.": ["未选择文件。", "No file selected."],
  "Aucun modèle": ["没有模型", "No model"],
  "Aucune entrée.": ["没有条目。", "No entries."],
  "Aucune ressource détectée. Vérifiez que le serveur ComfyUI charge bien ses dossiers de modèles.":
    [
      "未检测到资源。请确认 ComfyUI 服务器已正确加载模型目录。",
      "No resources detected. Check that the ComfyUI server loads its model folders.",
    ],
  "Ce workflow ne contient aucun nœud.": [
    "该工作流不包含任何节点。",
    "This workflow has no nodes.",
  ],
  "Clé API": ["API 密钥", "API key"],
  "Clé enregistrée · laisser vide": [
    "已保存密钥 · 留空保持",
    "Key saved · leave empty",
  ],
  "Configurez une API de génération dans les paramètres pour activer cet assistant.":
    [
      "请先在设置中配置生成 API 以启用此助手。",
      "Configure a generation API in settings to enable this assistant.",
    ],
  "Connectez un serveur ComfyUI pour lire ses ressources.": [
    "连接 ComfyUI 服务器后可读取其资源。",
    "Connect a ComfyUI server to read its resources.",
  ],
  "Connexion réussie · {0}": ["连接成功 · {0}", "Connected · {0}"],
  "Encodeur de texte": ["文本编码器", "Text encoder"],
  "Filtrer les modèles": ["筛选模型", "Filter models"],
  "Filtrer les modèles…": ["筛选模型…", "Filter models…"],
  Fournisseurs: ["服务商", "Providers"],
  "Import trop volumineux.": ["导入内容过大。", "Import too large."],
  "Importer un dossier skill": ["导入 skill 文件夹", "Import a skill folder"],
  "Importez un dossier contenant SKILL.md pour créer un modèle réutilisable.":
    [
      "导入包含 SKILL.md 的文件夹以创建可复用模板。",
      "Import a folder containing SKILL.md to create a reusable template.",
    ],
  "Inclus dans le checkpoint": ["包含在 checkpoint 中", "Bundled in the checkpoint"],
  "Lecture du dossier…": ["正在读取文件夹…", "Reading folder…"],
  "Limite de 100 modèles atteinte.": [
    "已达 100 个模板上限。",
    "Limit of 100 templates reached.",
  ],
  "Lister les modèles": ["获取模型列表", "List models"],
  "L’assistant de prompt envoie votre description à l’API de votre choix, puis renvoie des blocs de tags à valider. La clé reste sur cet appareil.":
    [
      "提示词助手会把你的描述发送到你选择的 API，然后返回待确认的标签块。密钥只保存在本机。",
      "The prompt assistant sends your description to the API you choose, then returns tag blocks to review. The key stays on this device.",
    ],
  "Modifiez les nœuds du graphe directement : modèles, prompts, dimensions, sampler. Le mode automatique n’affecte pas ce graphe.":
    [
      "直接修改图中的节点：模型、提示词、尺寸、采样器。自动模式不会影响该图。",
      "Edit graph nodes directly: models, prompts, dimensions, sampler. Automatic mode does not affect this graph.",
    ],
  "Modèle de prompt": ["提示词模板", "Prompt template"],
  "Modèle invalide.": ["模板无效。", "Invalid template."],
  "Modèle « {0} » importé.": ["模板「{0}」已导入。", "Template “{0}” imported."],
  "Modèles de prompt": ["提示词模板", "Prompt templates"],
  "Modèles, encodeurs et VAE disponibles": [
    "可用的模型、编码器与 VAE",
    "Available models, encoders and VAE",
  ],
  "Non défini": ["未指定", "Not set"],
  "Nouveautés de cette version": ["本次更新内容", "What’s new"],
  "Prompt mis à jour dans le workflow.": [
    "提示词已写入工作流。",
    "Prompt updated in the workflow.",
  ],
  "Ressources du serveur": ["服务器资源", "Server resources"],
  "Revenir à la vue d’ensemble": ["回到总览", "Back to overview"],
  "Réduire le zoom": ["缩小", "Zoom out"],
  "SKILL.md est vide.": ["SKILL.md 为空。", "SKILL.md is empty."],
  "SKILL.md introuvable dans le dossier importé.": [
    "导入的文件夹中找不到 SKILL.md。",
    "SKILL.md not found in the imported folder.",
  ],
  "Sans description": ["无描述", "No description"],
  Température: ["温度", "Temperature"],
  Tester: ["测试", "Test"],
  "Trop de fichiers à importer.": ["待导入文件过多。", "Too many files to import."],
  "Version installée : {0}": ["已安装版本：{0}", "Installed version: {0}"],
  "Voir la publication complète": ["查看完整发布说明", "View the full release"],
  "Vue visuelle": ["可视化视图", "Visual view"],
  "Workflow API": ["API 工作流", "API workflow"],
  "utilisé": ["使用中", "in use"],
  "{0} / 100": ["{0} / 100", "{0} / 100"],
  "{0} autres fichiers…": ["还有 {0} 个文件…", "{0} more files…"],
  "{0} modèles disponibles sur cette API.": [
    "该 API 有 {0} 个可用模型。",
    "{0} models available on this API.",
  ],
  "{0} nœuds · {1} liens": ["{0} 个节点 · {1} 条连线", "{0} nodes · {1} links"],
  "{0} ressources sur ce serveur": [
    "该服务器共 {0} 项资源",
    "{0} resources on this server",
  ],
  "{0} variables": ["{0} 个变量", "{0} variables"],
  "Éditer": ["编辑", "Edit"],
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
