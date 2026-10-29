const fs = require("node:fs");
const p = "D:/demo/Paint-v1/_build/updatecheck.mjs";
let t = fs.readFileSync(p, "utf8");
t = t.split('version: "1.1.0"').join('version: "1.1.1"');
fs.writeFileSync(p, t);
const m = t.match(/const release = \{[\s\S]*?\};/);
console.log(m ? m[0].slice(0, 200) : "not found");
