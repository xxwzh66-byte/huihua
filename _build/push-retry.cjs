const { execSync } = require("node:child_process");

const cwd = "D:/demo/Paint-v1";
let pushed = false;
for (let i = 1; i <= 40 && !pushed; i++) {
  try {
    const out = execSync("git push origin main", { cwd, encoding: "utf8", stdio: "pipe" });
    console.log(`attempt ${i}: ok`);
    console.log(out.trim());
    pushed = true;
  } catch (error) {
    const text = `${error.stdout || ""}${error.stderr || ""}`.trim().split("\n").pop();
    console.log(`attempt ${i}: ${text}`);
    execSync("node -e \"setTimeout(()=>{},0)\"", { cwd });
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 20000);
  }
}
console.log(pushed ? "PUSHED" : "GAVE UP");
process.exit(pushed ? 0 : 1);
