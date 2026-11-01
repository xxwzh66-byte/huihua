import fs from "node:fs";

const edits = [
  ["package.json", '"version": "1.17.0"', '"version": "1.18.0"'],
  ["src-tauri/tauri.conf.json", '"version": "1.17.0"', '"version": "1.18.0"'],
  ["src-tauri/Cargo.toml", 'version = "1.17.0"', 'version = "1.18.0"'],
];

for (const [file, from, to] of edits) {
  const text = fs.readFileSync(file, "utf8");
  if (!text.includes(from)) throw new Error(`missing ${from} in ${file}`);
  fs.writeFileSync(file, text.replace(from, to));
}

// versionCode = 10000 + minor * 100 + patch → 1.18.0 → 11800.
// 这个文件由 `tauri android init` 生成，仓库里可能不存在，缺了就跳过。
const propsFile = "src-tauri/gen/android/app/tauri.properties";
if (fs.existsSync(propsFile)) {
  const props = fs
    .readFileSync(propsFile, "utf8")
    .replace("tauri.android.versionName=1.17.0", "tauri.android.versionName=1.18.0")
    .replace("tauri.android.versionCode=11700", "tauri.android.versionCode=11800");
  fs.writeFileSync(propsFile, props);
  console.log("bumped tauri.properties too");
}
console.log("bumped to 1.18.0 (versionCode 11800)");
