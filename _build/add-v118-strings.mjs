import fs from "node:fs";

const DIR = "D:/demo/Paint-v1/src/locales";
const files = { zh: "zh-CN.json", en: "en.json" };

// [key (source string passed to t()), zh-CN, en]
const entries = [
  ["提示词装配", "提示词装配", "Prompt assembly"],
  [
    "把固定块、质量标签和替换规则拼在提示词外面。工作流里的 {{prompt}} 会收到拼好的结果。",
    "把固定块、质量标签和替换规则拼在提示词外面。工作流里的 {{prompt}} 会收到拼好的结果。",
    "Fixed blocks, quality tags and replacement rules are wrapped around your prompt. {{prompt}} receives the result.",
  ],
  ["前置固定", "前置固定", "Fixed prefix"],
  ["写在你的提示词前面", "写在你的提示词前面", "Written before your prompt"],
  ["后置固定", "后置固定", "Fixed suffix"],
  ["写在你的提示词后面", "写在你的提示词后面", "Written after your prompt"],
  ["质量标签（正面）", "质量标签（正面）", "Quality tags (positive)"],
  ["质量标签（负面）", "质量标签（负面）", "Quality tags (negative)"],
  ["放在负面提示词最前", "放在负面提示词最前", "Prefixes the negative prompt"],
  ["填入推荐值", "填入推荐值", "Fill the usual set"],
  ["固定块预设", "固定块预设", "Fixed block preset"],
  ["名称", "名称", "Name"],
  ["保存", "保存", "Save"],
  ["删除固定块预设", "删除固定块预设", "Delete the fixed block preset"],
  ["清空装配", "清空装配", "Clear the assembly"],
  ["清空", "清空", "Clear"],
  ["替换规则", "替换规则", "Replacement rules"],
  ["命中 {0} 条", "命中 {0} 条", "{0} rules fire"],
  [
    "每行一条：触发词 | 类型 | 内容。类型可以是 替换 / 前置前 / 前置后 / 后置前 / 后置后 / 最后置。触发词用 | 分隔，/正则/ 可用。",
    "每行一条：触发词 | 类型 | 内容。类型可以是 替换 / 前置前 / 前置后 / 后置前 / 后置后 / 最后置。触发词用 | 分隔，/正则/ 可用。",
    "One rule per line: trigger | type | content. Type is one of 替换 / 前置前 / 前置后 / 后置前 / 后置后 / 最后置. Separate triggers with |, and /regex/ works.",
  ],
  ["规则预设", "规则预设", "Rule preset"],
  ["保存规则", "保存规则", "Save the rules"],
  ["删除规则预设", "删除规则预设", "Delete the rule preset"],
  ["替换后", "替换后", "After replacement"],
  ["实际发送的正面提示词", "实际发送的正面提示词", "Positive prompt actually sent"],
  ["配置档案", "配置档案", "Profile"],
  ["保存整套配置", "保存整套配置", "Save the whole setup"],
  ["删除配置档案", "删除配置档案", "Delete the profile"],
  ["Blocs fixes", "固定块", "Fixed blocks"],
  ["Blocs fixes enregistrés.", "固定块已保存。", "Fixed blocks saved."],
  ["Règles", "规则", "Rules"],
  ["Règles enregistrées.", "规则已保存。", "Rules saved."],
  ["Réglage", "配置", "Setup"],
  ["配置档案已保存。", "配置档案已保存。", "Profile saved."],
  ["Sans titre", "未命名", "Untitled"],
  [
    "L’enregistrement local est indisponible sur cet appareil.",
    "这台设备无法写入本地存储。",
    "Local storage is unavailable on this device.",
  ],
  ["{0} 条连线", "{0} 条连线", "{0} links"],
  ["{0} 个已跳过", "{0} 个已跳过", "{0} skipped"],
  ["跳过此节点", "跳过此节点", "Skip this node"],
  [
    "执行时会把下游直接接到它的上游。",
    "执行时会把下游直接接到它的上游。",
    "Its consumers are reconnected to its upstream when generating.",
  ],
  [
    "这个节点没有上游输入，不能跳过。",
    "这个节点没有上游输入，不能跳过。",
    "This node has no upstream input, so it cannot be skipped.",
  ],
  ["节点 {0} 已跳过，生成时会旁路。", "节点 {0} 已跳过，生成时会旁路。", "Node {0} is skipped and bypassed on generate."],
  ["节点 {0} 已恢复。", "节点 {0} 已恢复。", "Node {0} is active again."],
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
