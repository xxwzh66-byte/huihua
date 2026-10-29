import fs from "node:fs";

const file = "D:/demo/Paint-v1/README.md";
let text = fs.readFileSync(file, "utf8");

text = text.replace("# 绘画 1.1.1", "# 绘画 1.1.2");

text = text.replace(
  "- **AI 生成提示词**：在「设置 → 生成 API」里填入任意 OpenAI 兼容接口（OpenAI / DeepSeek / Ollama / SiliconFlow 或自建），描述一句话即可生成提示词，结果可一键复制。",
  "- **提示词独立成页**：底部导航自带「提示词」按钮。在「设置 → 生成 API」里填入任意 OpenAI 兼容接口（OpenAI / DeepSeek / Ollama / SiliconFlow 或自建），写一句描述就能直接出标签，结果一键复制，或一键填入工坊的正 / 负向提示词。\n- **注入模板可查看可改**：每次请求真正发给 API 的 system 指令可以展开查看、就地修改、保存到本机，编辑区实时预览 `system:` 与 `user:` 两段实际内容。",
);

text = text.replace(
  "| 1.1.1 | arm64-v8a | 73.6 MB | [huihua-1.1.1-arm64.apk](https://github.com/xxwzh66-byte/huihua/releases/download/v1.1.1/huihua-1.1.1-arm64.apk) |\n| 1.1.0 |",
  "| 1.1.2 | arm64-v8a | 73.6 MB | [huihua-1.1.2-arm64.apk](https://github.com/xxwzh66-byte/huihua/releases/download/v1.1.2/huihua-1.1.2-arm64.apk) |\n| 1.1.1 | arm64-v8a | 73.6 MB | [huihua-1.1.1-arm64.apk](https://github.com/xxwzh66-byte/huihua/releases/download/v1.1.1/huihua-1.1.1-arm64.apk) |\n| 1.1.0 |",
);

text = text.replace("adb install huihua-1.1.1-arm64.apk", "adb install huihua-1.1.2-arm64.apk");
text = text.replace(
  "1.0.0 / 1.1.0 / 1.1.1 使用同一签名证书",
  "1.0.0 / 1.1.0 / 1.1.1 / 1.1.2 使用同一签名证书",
);

const notes = `## 更新内容

### 1.1.2

- 底部导航新增「提示词」页：独立输入框，写一句描述就能让配好的 AI 接口直接返回 Danbooru 标签。
- 生成结果支持一键复制（带失败降级），并保留最近 30 条历史，可单条删除或整清空。
- 结果可直接「填入工坊正向提示词」或「填入负向提示词」，点完自动跳回工坊。
- 新增「查看 / 修改注入模板」：能看到每次请求真正发给 API 的 system 指令，可编辑并保存到本机，没选模板时改的是全局默认指令。
- 编辑区实时预览 \`system:\` 与 \`user:\` 两段实际发送内容，并带「填入默认指令」「恢复默认」。
- 修正作品集日期：历史记录没有时间戳时不再显示 1970/1/1，改为显示所在文件夹（空文件夹显示「输出」）。
- 提示词页与工作流占位符共用同一份模板存储，导入的 skill 模板可以直接选。

### 1.1.1
`;

text = text.replace("## 更新内容\n\n### 1.1.1\n", notes);

fs.writeFileSync(file, text);
console.log("README updated");
