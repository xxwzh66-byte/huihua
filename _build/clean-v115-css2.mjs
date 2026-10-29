// Remove whole CSS rule blocks whose selector list is dead after v1.15
// (voice assistant entry, autocomplete switch, Danbooru suggestion bubble, editor hint).
import { readFileSync, writeFileSync } from "node:fs";

const dead = {
  "src/mobile.css": [
    ".prompt-editor .autocomplete-setting",
    ".prompt-editor .editor-hint",
    ".prompt-editor .suggestion-bubble",
    ".prompt-editor.compact-editor .autocomplete-setting",
    ".prompt-editor.compact-editor .suggestion-bubble",
    ".prompt-editor.compact-editor .editor-hint",
  ],
  "src/mochi.css": [".suggestion-bubble", ".suggestion-bubble button"],
  "src/prompt-blocks.css": [
    ".editor-mode-bar .voice-entry",
    ".prompt-editor.compact-editor .voice-entry span",
    ".prompt-editor.compact-editor .voice-entry",
  ],
  "src/prompt-experience.css": [
    ".prompt-editor .suggestion-bubble",
    ".prompt-editor .autocomplete-setting",
    ".prompt-editor .editor-hint",
  ],
};

// Matches `selector { ... }` including a rule with `@media (...) {` wrappers only
// when the block itself is a plain selector; nested media blocks are handled by
// leaving them alone unless the selector text is an exact dead match.
function stripBlock(source, selector) {
  let out = source;
  let removed = 0;
  let from = 0;
  for (;;) {
    const at = out.indexOf(selector, from);
    if (at === -1) break;
    const open = out.indexOf("{", at + selector.length);
    if (open === -1) break;
    // Reject if the selector text is only a prefix of a longer selector.
    const between = out.slice(at + selector.length, open);
    if (between.trim() !== "" && !between.trim().startsWith(",") && !between.trim().startsWith("{")) {
      from = at + selector.length;
      continue;
    }
    // Only strip when the selector starts at a rule boundary (line start).
    const lineStart = out.lastIndexOf("\n", at) + 1;
    const prefix = out.slice(lineStart, at);
    if (prefix.trim() !== "") {
      from = at + selector.length;
      continue;
    }
    let depth = 0;
    let end = -1;
    for (let i = open; i < out.length; i += 1) {
      if (out[i] === "{") depth += 1;
      else if (out[i] === "}") {
        depth -= 1;
        if (depth === 0) {
          end = i + 1;
          break;
        }
      }
    }
    if (end === -1) break;
    let tail = end;
    while (tail < out.length && (out[tail] === "\r" || out[tail] === "\n")) tail += 1;
    out = out.slice(0, lineStart) + out.slice(tail);
    removed += 1;
  }
  return { out, removed };
}

let total = 0;
for (const [file, selectors] of Object.entries(dead)) {
  let source = readFileSync(file, "utf8");
  let fileRemoved = 0;
  for (const selector of selectors) {
    const result = stripBlock(source, selector);
    source = result.out;
    fileRemoved += result.removed;
  }
  writeFileSync(file, source, "utf8");
  total += fileRemoved;
  console.log(`${file}: removed ${fileRemoved}`);
}
console.log("total", total);
