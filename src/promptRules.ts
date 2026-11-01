/**
 * Prompt assembly rules, ported from the ComfyUI panel of st-chatu8.
 *
 * A rule line looks like `trigger | type | content`:
 *   trigger  one or more triggers separated by `|` (the last one is the type,
 *            so keep exactly one pipe before the type)
 *   type     `替换` / `前置前` / `前置后` / `后置前` / `后置后` / `最后置`
 *   content  what to substitute, or what to insert at that slot
 *
 * Matching is case-insensitive substring matching; a `/…/ ` trigger is treated
 * as a regular expression. Rules run in file order so later ones see the edits
 * of earlier ones.
 */

export type Slot = "前置前" | "前置后" | "后置前" | "后置后" | "最后置";
export type RuleType = "替换" | Slot;

export const SLOTS: Slot[] = ["前置前", "前置后", "后置前", "后置后", "最后置"];
export const RULE_TYPES: RuleType[] = ["替换", ...SLOTS];

export interface Rule {
  /** Alternative triggers, any of them fires the rule. */
  triggers: string[];
  type: RuleType;
  content: string;
  /** Raw line, kept for round-tripping and for pointing at bad input. */
  source: string;
}

export interface RuleSet {
  modifiedPrompt: string;
  insertions: Record<Slot, string>;
  applied: number;
}

export interface Assembly {
  /** Fixed block written before the user's prompt. */
  before: string;
  /** Fixed block written after the user's prompt. */
  after: string;
  /** Quality tags appended last (positive side). */
  quality: string;
  /** Quality tags prefixed to the negative side. */
  qualityNegative: string;
}

export const emptyAssembly: Assembly = {
  before: "",
  after: "",
  quality: "",
  qualityNegative: "",
};

const TYPE_LOOKUP = new Map<string, RuleType>(
  RULE_TYPES.map((type) => [type, type]),
);

/** Split one `a | b | c` line into `[left, right]` on the LAST pipe. */
export function splitRuleLine(line: string): [string, string] | null {
  const at = line.lastIndexOf("|");
  if (at < 0) return null;
  const left = line.slice(0, at).trim();
  const right = line.slice(at + 1).trim();
  if (!left || !right) return null;
  return [left, right];
}

/**
 * A rule's trigger column may itself contain pipes: `a | b | 替换`. The type is
 * the rightmost known type name, everything before it is a trigger list.
 */
export function parseRule(line: string): Rule | null {
  const text = line.replace(/\r$/, "").trim();
  if (!text || text.startsWith("#")) return null;
  const halves = splitRuleLine(text);
  if (!halves) return null;
  const [left, content] = halves;
  const parts = left
    .split("|")
    .map((part) => part.trim())
    .filter(Boolean);
  const tail = parts[parts.length - 1];
  const type = tail ? TYPE_LOOKUP.get(tail) : undefined;
  if (!type) return null;
  const triggers = parts.slice(0, -1);
  if (!triggers.length) return null;
  return { triggers, type, content, source: text };
}

export function parseRules(text: string): Rule[] {
  const out: Rule[] = [];
  for (const line of text.split("\n")) {
    const rule = parseRule(line);
    if (rule) out.push(rule);
  }
  return out;
}

export function serializeRules(rules: Rule[]): string {
  return rules
    .map((rule) => `${rule.triggers.join(" | ")} | ${rule.type} | ${rule.content}`)
    .join("\n");
}

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** `/pattern/` becomes a case-insensitive RegExp, anything else stays literal. */
function matcher(trigger: string): { test: (s: string) => boolean; replace: (s: string, with_: string) => string } {
  const asRegex = /^\/(.+)\/$/.exec(trigger);
  if (asRegex) {
    let regex: RegExp;
    try {
      regex = new RegExp(asRegex[1], "gi");
    } catch {
      regex = new RegExp(escape(asRegex[1]), "gi");
    }
    return {
      test: (s) => {
        regex.lastIndex = 0;
        return regex.test(s);
      },
      replace: (s, with_) => {
        regex.lastIndex = 0;
        return s.replace(regex, () => with_);
      },
    };
  }
  const regex = new RegExp(escape(trigger), "gi");
  return {
    test: (s) => {
      regex.lastIndex = 0;
      return regex.test(s);
    },
    replace: (s, with_) => {
      regex.lastIndex = 0;
      return s.replace(regex, () => with_);
    },
  };
}

/** Split on commas, drop blanks and duplicates, keep the original casing. */
export function dedupeTags(text: string): string {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const piece of text.split(",")) {
    const tag = piece.replace(/\s+/g, " ").trim();
    if (!tag) continue;
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(tag);
  }
  return out.join(", ");
}

export function applyRules(prompt: string, rulesText: string): RuleSet {
  const insertions: Record<Slot, string[]> = {
    前置前: [],
    前置后: [],
    后置前: [],
    后置后: [],
    最后置: [],
  };
  let modifiedPrompt = prompt;
  let applied = 0;
  for (const rule of parseRules(rulesText)) {
    let fired = false;
    for (const trigger of rule.triggers) {
      const match = matcher(trigger);
      if (!match.test(modifiedPrompt)) continue;
      fired = true;
      if (rule.type === "替换") {
        modifiedPrompt = match.replace(modifiedPrompt, rule.content);
      } else {
        insertions[rule.type].push(rule.content);
      }
    }
    if (fired) applied += 1;
  }
  const joined = {} as Record<Slot, string>;
  for (const slot of SLOTS) joined[slot] = insertions[slot].join(", ");
  return { modifiedPrompt, insertions: joined, applied };
}

/**
 * Lay a prompt out in the fixed slots. Empty slots collapse, so a profile that
 * only sets a negative-quality block costs nothing on the positive side.
 */
export function assemble(
  rules: RuleSet,
  assembly: Assembly,
): string {
  const parts = [
    rules.insertions["前置前"],
    assembly.before,
    rules.insertions["前置后"],
    rules.modifiedPrompt,
    rules.insertions["后置前"],
    assembly.after,
    rules.insertions["后置后"],
    assembly.quality,
    rules.insertions["最后置"],
  ];
  return dedupeTags(parts.filter((p) => p && p.trim()).join(", "));
}

/** Negative side: quality tags lead, then the fixed block, then the rules. */
export function assembleNegative(
  rules: RuleSet,
  assembly: Assembly,
): string {
  const parts = [
    assembly.qualityNegative,
    rules.insertions["前置前"],
    assembly.before,
    rules.insertions["前置后"],
    rules.modifiedPrompt,
    rules.insertions["后置前"],
    assembly.after,
    rules.insertions["后置后"],
    rules.insertions["最后置"],
  ];
  return dedupeTags(parts.filter((p) => p && p.trim()).join(", "));
}

/** Resolve the positive prompt an imported graph will actually receive. */
export function finalPrompt(
  prompt: string,
  rulesText: string,
  assembly: Assembly,
): { text: string; rules: RuleSet } {
  const rules = applyRules(prompt, rulesText);
  return { text: assemble(rules, assembly), rules };
}

export function finalNegative(
  prompt: string,
  rulesText: string,
  assembly: Assembly,
): { text: string; rules: RuleSet } {
  const rules = applyRules(prompt, rulesText);
  return { text: assembleNegative(rules, assembly), rules };
}
