// Third pass: remove the last v1.15 dead CSS (compact editor suggestion blocks,
// tag-option mark, suggestion retry, prompt issue count, reduced-motion autocomplete)
// and strip the suggestion rules embedded in single-line @media blocks.
import { readFileSync, writeFileSync } from "node:fs";

function blocks(file, selectors) {
  let source = readFileSync(file, "utf8");
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
      if (source.slice(at + selector.length, open).trim() !== "") {
        from = at + selector.length;
        continue;
      }
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
  console.log(`${file}: removed ${removed}`);
}

blocks("src/mobile.css", [
  ".prompt-editor.compact-editor .suggestion-heading",
  ".prompt-editor.compact-editor .tag-option",
  ".prompt-editor.compact-editor .tag-option small",
  ".prompt-editor.compact-editor .tag-suggestions",
]);

blocks("src/prompt-experience.css", [
  ".prompt-editor .tag-option mark",
  ".prompt-editor .suggestion-retry",
  ".prompt-editor .prompt-issue-count",
]);

// refinements.css: single-line leftover + reduced-motion rule referencing the switch.
{
  const file = "src/refinements.css";
  const source = readFileSync(file, "utf8");
  const kept = source
    .split("\n")
    .filter((line) => {
      const t = line.trim();
      return t !== ".suggestion-empty { font-size: .8rem; color: #727272; padding: 10px 0; }" &&
        t !== "@media(prefers-reduced-motion:reduce) { .autocomplete-setting input::before { transition: none; } }";
    })
    .join("\n");
  writeFileSync(file, kept, "utf8");
  console.log(`${file}: trimmed 2 line(s)`);
}

// experience.css: suggestion rules inside single-line @media blocks.
{
  const file = "src/experience.css";
  let source = readFileSync(file, "utf8");
  source = source
    .replace(" .tag-suggestions { grid-template-columns: repeat(3,minmax(0,1fr)); }", "")
    .replace(" .suggestion-dock { max-height: 34%; } .suggestion-heading { margin-bottom: 4px; }", "")
    .replace("}.suggestion-heading small { font-size: .59rem; }.suggestion-bubble { padding: 9px; } }", "} }");
  writeFileSync(file, source, "utf8");
  console.log(`${file}: cleaned media blocks`);
}
