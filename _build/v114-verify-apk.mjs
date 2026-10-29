// Confirm the APK actually carries the v1.14 frontend.
//
// Tauri bakes `dist/` into the Rust library at cargo-build time (build.rs reads
// `frontendDist`), and the bundle filenames are content-hashed. So if the
// hashed names inside the .so match the current dist/, that build shipped this
// exact frontend. A mismatch means the .so is stale — installing it gives a
// white screen or an old UI.
import { readFileSync, readdirSync } from "node:fs";

const so =
  "D:\\demo\\Paint-v1\\src-tauri\\gen\\android\\app\\src\\main\\jniLibs\\arm64-v8a\\libhuihua_lib.so";
const hay = readFileSync(so).toString("latin1");
const dist = "D:\\demo\\Paint-v1\\dist\\assets";

const hashed = readdirSync(dist).filter((n) => /^index-.*\.(js|css)$/.test(n));
if (!hashed.length) throw new Error("dist/assets has no index-*.js|css — run npx vite build first");

let ok = true;
for (const name of hashed) {
  const embedded = hay.includes(name);
  if (!embedded) ok = false;
  console.log(`${name}: embedded=${embedded}`);
}
console.log("so bytes:", readFileSync(so).length);
console.log(ok ? "OK: the library embeds the current dist bundle" : "STALE: rebuild cargo after vite build");
process.exit(ok ? 0 : 1);
