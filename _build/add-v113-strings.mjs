import fs from "node:fs";

const add = {
  "Importez un workflow API": ["请导入一个 API 工作流", "Import an API workflow"],
  "导入 ComfyUI 的 API 工作流后可以直接改参数。用占位符（如 {{sampler}}、{{prompt}}）把字段交给工坊设置，生成时会自动填入。":
    [
      "导入 ComfyUI 的 API 工作流后可以直接改参数。用占位符（如 {{sampler}}、{{prompt}}）把字段交给工坊设置，生成时会自动填入。",
      "Import a ComfyUI API workflow, then edit its parameters directly. Placeholders such as {{sampler}} or {{prompt}} hand a field to the Atelier settings and are filled in at generation time.",
    ],
  "用 API 生成提示词": ["用 API 生成提示词", "Generate a prompt with the API"],
  "自动设置 · {0}": ["自动设置 · {0}", "Atelier setting · {0}"],
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
