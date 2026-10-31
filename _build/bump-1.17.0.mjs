import fs from "node:fs";

const edits = [
  ["package.json", '"version": "1.16.0"', '"version": "1.17.0"'],
  ["src-tauri/tauri.conf.json", '"version": "1.16.0"', '"version": "1.17.0"'],
  ["src-tauri/Cargo.toml", 'version = "1.16.0"', 'version = "1.17.0"'],
];

for (const [file, from, to] of edits) {
  const text = fs.readFileSync(file, "utf8");
  if (!text.includes(from)) throw new Error(`missing ${from} in ${file}`);
  fs.writeFileSync(file, text.replace(from, to));
}

// versionCode = 10000 + minor * 100 + patch → 1.17.0 → 11700.
// 这个文件由 `tauri android init` 生成，仓库里可能不存在，缺了就跳过。
const propsFile = "src-tauri/gen/android/app/tauri.properties";
if (fs.existsSync(propsFile)) {
  const props = fs
    .readFileSync(propsFile, "utf8")
    .replace("tauri.android.versionName=1.16.0", "tauri.android.versionName=1.17.0")
    .replace("tauri.android.versionCode=11600", "tauri.android.versionCode=11700");
  fs.writeFileSync(propsFile, props);
  console.log("bumped tauri.properties too");
}
console.log("bumped to 1.17.0 (versionCode 11700)");
