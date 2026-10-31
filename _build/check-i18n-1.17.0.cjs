const fs = require("node:fs");

const en = JSON.parse(fs.readFileSync("src/locales/en.json", "utf8"));
const zh = JSON.parse(fs.readFileSync("src/locales/zh-CN.json", "utf8"));

const enKeys = Object.keys(en);
const zhKeys = Object.keys(zh);
const missingInZh = enKeys.filter((k) => !(k in zh));
const missingInEn = zhKeys.filter((k) => !(k in en));

// 代码里用 t("...") 引用的键必须都存在，否则界面上会露出原始 key。
const srcFiles = [];
const walk = (dir) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = `${dir}/${e.name}`;
    if (e.isDirectory()) walk(p);
    else if (/\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) srcFiles.push(p);
  }
};
walk("src");

const used = new Set();
for (const f of srcFiles) {
  const text = fs.readFileSync(f, "utf8");
  for (const m of text.matchAll(/\bt\(\s*"([^"]+)"/g)) used.add(m[1]);
}
const missingUsed = [...used].filter((k) => !(k in en));

console.log(
  JSON.stringify(
    {
      en: enKeys.length,
      zh: zhKeys.length,
      missingInZh,
      missingInEn,
      usedKeys: used.size,
      missingUsed,
    },
    null,
    2,
  ),
);

const bad = missingInZh.length || missingInEn.length || missingUsed.length;
process.exit(bad ? 1 : 0);
