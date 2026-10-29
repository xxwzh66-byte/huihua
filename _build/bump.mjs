import fs from "node:fs";
for (const [file, from, to] of [
  ["package.json", '"version": "1.1.0"', '"version": "1.1.1"'],
  ["src-tauri/tauri.conf.json", '"version": "1.1.0"', '"version": "1.1.1"'],
  ["src-tauri/Cargo.toml", 'version = "1.1.0"', 'version = "1.1.1"'],
]) {
  const text = fs.readFileSync(file, "utf8");
  if (!text.includes(from)) throw new Error("missing " + from + " in " + file);
  fs.writeFileSync(file, text.replace(from, to));
}
const props = fs.readFileSync("src-tauri/gen/android/app/tauri.properties", "utf8")
  .replace("tauri.android.versionName=1.1.0", "tauri.android.versionName=1.1.1")
  .replace("tauri.android.versionCode=10100", "tauri.android.versionCode=10101");
fs.writeFileSync("src-tauri/gen/android/app/tauri.properties", props);
console.log("bumped");
