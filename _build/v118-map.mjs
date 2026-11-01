import fs from "node:fs";
const s = fs.readFileSync("src/App.tsx", "utf8").split("\n");
const pat = /atelier-layout|studio-pc|configuration-slot|studio-workflow|PromptSection|studio-imports|studio-render|generate-bar|studio-/;
s.forEach((line, i) => {
  if (pat.test(line)) console.log((i + 1) + ": " + line.trim().slice(0, 140));
});
console.log("TOTAL " + s.length);
