import fs from "node:fs";

const edits = [
  ["package.json", '"version": "1.14.0"', '"version": "1.15.0"'],
  ["src-tauri/tauri.conf.json", '"version": "1.14.0"', '"version": "1.15.0"'],
  ["src-tauri/Cargo.toml", 'version = "1.14.0"', 'version = "1.15.0"'],
];

for (const [file, from, to] of edits) {
  const text = fs.readFileSync(file, "utf8");
  if (!text.includes(from)) throw new Error(`missing ${from} in ${file}`);
  fs.writeFileSync(file, text.replace(from, to));
}

// versionCode = 10000 + minor * 100 + patch → 1.15.0 → 11500.
const propsFile = "src-tauri/gen/android/app/tauri.properties";
const props = fs
  .readFileSync(propsFile, "utf8")
  .replace("tauri.android.versionName=1.14.0", "tauri.android.versionName=1.15.0")
  .replace("tauri.android.versionCode=11400", "tauri.android.versionCode=11500");
fs.writeFileSync(propsFile, props);
console.log("bumped to 1.15.0 (versionCode 11500)");
