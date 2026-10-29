const fs = require("node:fs");
const p = "D:/demo/Paint-v1/_build/updatecheck.mjs";
let t = fs.readFileSync(p, "utf8");
const notes = fs.readFileSync("D:/demo/Paint-v1/_build/release-1.1.1.md", "utf8").trim();
t = t.replace(/const NOTES = "(?:[^"\\]|\\.)*";/, "const NOTES = " + JSON.stringify(notes) + ";");
fs.writeFileSync(p, t);
console.log("notes synced", notes.split("\n").length, "lines");
