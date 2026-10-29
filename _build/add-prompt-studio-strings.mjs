import fs from "node:fs";
import path from "node:path";

const dir = "D:/demo/Paint-v1/src/locales";
const missing = JSON.parse(
  fs.readFileSync("D:/demo/Paint-v1/_build/missing-strings.json", "utf8"),
);

/** [source, zh, en] — zh equal to source when the source is already Chinese. */
const table = [
  ["提示词", "", "Prompt"],
  ["复制", "", "Copy"],
  ["已复制", "", "Copied"],
  ["清空", "", "Clear"],
  ["清空记录", "", "Clear history"],
  ["描述你想画的画面", "", "Describe the picture"],
  ["提示词模板", "", "Prompt template"],
  ["最近生成", "", "Recent prompts"],
  ["正在生成…", "", "Generating…"],
  ["生成提示词", "", "Generate prompt"],
  ["生成的提示词", "", "Generated prompt"],
  ["画面描述", "", "Scene description"],
  ["配置生成 API", "", "Configure the API"],
  ["删除这条记录", "", "Delete this entry"],
  ["停止生成", "", "Stop"],
  ["填入工坊正向提示词", "", "Insert as positive prompt"],
  ["填入负向提示词", "", "Insert as negative prompt"],
  ["不使用模板", "", "No template"],
  [
    "用一句话描述，例如「雨夜的东京街头，粉色霓虹，湿漉漉的柏油路」。",
    "",
    "One sentence is enough — for example “a Tokyo street at night in the rain, pink neon, wet asphalt”.",
  ],
  [
    "雨夜的东京街头，粉色霓虹，湿漉漉的柏油路上有倒影…",
    "",
    "A Tokyo street at night in the rain, pink neon, reflections on wet asphalt…",
  ],
  [
    "先在设置里填写生成 API 的地址与模型，这个页面才会工作。",
    "",
    "Fill in the API address and model in the settings first — this page needs them.",
  ],
  ["提示词已填入工坊的正向提示词。", "", "Prompt inserted as the positive prompt."],
  ["提示词已填入负向提示词。", "", "Prompt inserted as the negative prompt."],
  ["Ouverture de la page prompt", "", "Opening the prompt page"],
];

const known = new Set(table.map((row) => row[0]));
const extra = missing.filter((item) => !known.has(item));

for (const file of ["zh-CN.json", "en.json"]) {
  const target = path.join(dir, file);
  const data = JSON.parse(fs.readFileSync(target, "utf8"));
  for (const [source, zh, en] of table) {
    data[source] = file === "zh-CN.json" ? zh || source : en || source;
  }
  const sorted = {};
  for (const key of Object.keys(data).sort((a, b) => a.localeCompare(b)))
    sorted[key] = data[key];
  fs.writeFileSync(target, JSON.stringify(sorted, null, 2) + "\n", "utf8");
  console.log(file, Object.keys(sorted).length);
}
if (extra.length) console.log("NOT COVERED:", JSON.stringify(extra, null, 1));
