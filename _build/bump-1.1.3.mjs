import fs from "node:fs";

const edits = [
  ["package.json", '"version": "1.1.2"', '"version": "1.1.3"'],
  ["src-tauri/tauri.conf.json", '"version": "1.1.2"', '"version": "1.1.3"'],
  ["src-tauri/Cargo.toml", 'version = "1.1.2"', 'version = "1.1.3"'],
];

for (const [file, from, to] of edits) {
  const text = fs.readFileSync(file, "utf8");
  if (!text.includes(from)) throw new Error(`missing ${from} in ${file}`);
  fs.writeFileSync(file, text.replace(from, to));
}

const propsFile = "src-tauri/gen/android/app/tauri.properties";
const props = fs
  .readFileSync(propsFile, "utf8")
  .replace("tauri.android.versionName=1.1.2", "tauri.android.versionName=1.1.3")
  .replace("tauri.android.versionCode=10102", "tauri.android.versionCode=10103");
fs.writeFileSync(propsFile, props);
console.log("bumped to 1.1.3");
