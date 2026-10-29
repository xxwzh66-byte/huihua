// Remove CSS rules that belonged to the v1.15-removed prompt editor parts
// (voice assistant entry, autocomplete switch, Danbooru suggestion bubble, editor hint).
import { readFileSync, writeFileSync } from "node:fs";

const targets = {
  "src/experience.css": [
    ".editor-hint { font-size: .74rem; color: #727272; margin: 12px 0; line-height: 1.6; }",
    ".suggestion-bubble { position: absolute; z-index: 3; left: 0; right: 0; max-height: min(240px,calc(100% - 45px)); overflow: auto; padding: 12px; border: 1px solid #d3d3d3; border-radius: 18px; background: #fff; box-shadow: 0 12px 35px #4848482b; }",
    ".suggestion-bubble[hidden] { display: none; }",
    ".suggestion-bubble .tag-suggestions { display: flex; flex-wrap: wrap; gap: 7px; }",
    ".suggestion-bubble .tag-option { flex: 1 0 125px; background: #f9f9f9; }",
    ".suggestion-bubble .tag-option.highlighted { background: #f3f3f3; }",
    ".prompt-editor>.editor-hint { flex-shrink: 0; margin: 6px 0 0; font-size: .65rem; }",
  ],
};

let removed = 0;
for (const [file, lines] of Object.entries(targets)) {
  const source = readFileSync(file, "utf8");
  const kept = source
    .split("\n")
    .filter((line) => {
      const hit = lines.some((dead) => line.trim() === dead);
      if (hit) removed += 1;
      return !hit;
    })
    .join("\n");
  writeFileSync(file, kept, "utf8");
}
console.log("removed", removed, "line(s)");
