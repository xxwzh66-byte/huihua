// Second pass: remove leftover Danbooru-suggestion / autocomplete CSS that the
// v1.15 editor never renders any more, and drop the 175px bottom padding that
// existed only to keep room for the suggestion bubble.
import { readFileSync, writeFileSync } from "node:fs";

function prune(file, predicate, label) {
  const source = readFileSync(file, "utf8");
  const kept = [];
  let removed = 0;
  for (const line of source.split("\n")) {
    if (predicate(line)) removed += 1;
    else kept.push(line);
  }
  writeFileSync(file, kept.join("\n"), "utf8");
  console.log(`${file} [${label}]: removed ${removed}`);
}

// experience.css — suggestion dock / heading / tag grid / category dots.
prune(
  "src/experience.css",
  (line) => {
    const t = line.trim();
    if (!t) return false;
    const deadPrefixes = [
      ".suggestion-dock",
      ".suggestion-heading",
      ".tag-suggestions",
      ".tag-option",
      ".tag-dot",
      ".category-1",
      ".tag-add",
    ];
    return deadPrefixes.some((p) => t.startsWith(p));
  },
  "suggestion + tag grid",
);

// refinements.css — autocomplete switch + bubble min-height.
prune(
  "src/refinements.css",
  (line) => {
    const t = line.trim();
    return t.startsWith(".autocomplete-setting") || t === ".suggestion-bubble { min-height: 106px; }";
  },
  "autocomplete switch",
);
