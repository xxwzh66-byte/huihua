// Fourth pass: drop the CSS for the removed "Vérifier" (check) page.
import { readFileSync, writeFileSync } from "node:fs";

const file = "src/prompt-experience.css";
let source = readFileSync(file, "utf8");
const selectors = [
  ".prompt-library .prompt-check-description",
  ".prompt-library .prompt-issues",
  ".prompt-library .prompt-issues li",
  ".prompt-library .prompt-issues svg",
];
let removed = 0;
for (const selector of selectors) {
  let from = 0;
  for (;;) {
    const at = source.indexOf(selector, from);
    if (at === -1) break;
    const lineStart = source.lastIndexOf("\n", at) + 1;
    if (source.slice(lineStart, at).trim() !== "") {
      from = at + selector.length;
      continue;
    }
    const open = source.indexOf("{", at + selector.length);
    if (open === -1) break;
    let depth = 0;
    let end = -1;
    for (let i = open; i < source.length; i += 1) {
      if (source[i] === "{") depth += 1;
      else if (source[i] === "}") {
        depth -= 1;
        if (depth === 0) {
          end = i + 1;
          break;
        }
      }
    }
    if (end === -1) break;
    let tail = end;
    while (tail < source.length && (source[tail] === "\r" || source[tail] === "\n")) tail += 1;
    source = source.slice(0, lineStart) + source.slice(tail);
    removed += 1;
  }
}
writeFileSync(file, source, "utf8");
console.log(`${file}: removed ${removed} block(s)`);
