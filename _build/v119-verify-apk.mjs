import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const root = process.cwd();
const work = path.join(root, "_build", "apkcheck19");
fs.rmSync(work, { recursive: true, force: true });
fs.mkdirSync(work, { recursive: true });

const apk = path.join(root, "dist-apk", "huihua-1.19.0-arm64.apk");
const zip = path.join(work, "a.zip");
fs.copyFileSync(apk, zip);
execFileSync("powershell.exe", [
  "-NoProfile",
  "-Command",
  `Expand-Archive -LiteralPath '${zip}' -DestinationPath '${path.join(work, "x")}' -Force`,
]);

const so = path.join(work, "x", "lib", "arm64-v8a", "libhuihua_lib.so");
const raw = fs.readFileSync(so).toString("latin1");
const assets = fs.readdirSync(path.join(root, "dist", "assets"));
let missing = 0;
for (const name of assets) {
  const embedded = raw.includes(name);
  if (!embedded) {
    missing += 1;
    console.log("MISSING", name);
  }
}
console.log(`assets: ${assets.length} | embedded: ${assets.length - missing} | missing: ${missing}`);
fs.rmSync(work, { recursive: true, force: true });
if (missing) process.exit(1);
