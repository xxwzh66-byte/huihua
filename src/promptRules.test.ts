import "./testLocale";
import { describe, expect, it } from "vitest";
import {
  applyRules,
  assemble,
  assembleNegative,
  dedupeTags,
  emptyAssembly,
  finalPrompt,
  parseRule,
  parseRules,
  serializeRules,
  splitRuleLine,
} from "./promptRules";

describe("prompt replacement rules", () => {
  it("splits a rule line on the last pipe", () => {
    expect(splitRuleLine("a | b | 替换 | x")).toEqual(["a | b | 替换", "x"]);
    expect(splitRuleLine("no pipe")).toBeNull();
  });

  it("reads the rightmost known type and the triggers before it", () => {
    const rule = parseRule("1girl | solo | 前置前 | masterpiece");
    expect(rule).not.toBeNull();
    expect(rule?.type).toBe("前置前");
    expect(rule?.triggers).toEqual(["1girl", "solo"]);
    expect(rule?.content).toBe("masterpiece");
  });

  it("ignores comments, blanks and unknown types", () => {
    const rules = parseRules(
      ["# a comment", "", "hat | 替换 | beret", "x | 未知类型 | y"].join("\n"),
    );
    expect(rules).toHaveLength(1);
    expect(rules[0].content).toBe("beret");
  });

  it("round-trips through serializeRules", () => {
    const text = "1girl | solo | 前置后 | outdoors";
    expect(serializeRules(parseRules(text))).toBe("1girl | solo | 前置后 | outdoors");
  });

  it("replaces case-insensitively and keeps the rest of the prompt", () => {
    const set = applyRules("A HAT, smile", "hat | 替换 | beret");
    expect(set.modifiedPrompt).toBe("A beret, smile");
    expect(set.applied).toBe(1);
  });

  it("collects insertions per slot, in rule order", () => {
    const set = applyRules(
      "1girl, smile",
      [
        "1girl | 前置前 | solo",
        "smile | 最后置 | sharp focus",
        "1girl | 前置前 | best quality",
      ].join("\n"),
    );
    expect(set.insertions["前置前"]).toBe("solo, best quality");
    expect(set.insertions["最后置"]).toBe("sharp focus");
    expect(set.modifiedPrompt).toBe("1girl, smile");
    expect(set.applied).toBe(3);
  });

  it("treats /…/ triggers as expressions", () => {
    const set = applyRules("blue eyes, red eyes", "/red (eyes)/ | 替换 | crimson eyes");
    expect(set.modifiedPrompt).toBe("blue eyes, crimson eyes");
  });

  it("falls back to a literal match when the expression is invalid", () => {
    const set = applyRules("a (b", "/(unclosed/ | 替换 | z");
    expect(set.modifiedPrompt).toBe("a (b");
    expect(set.applied).toBe(0);
  });

  it("does nothing without rules", () => {
    const set = applyRules("1girl", "");
    expect(set.modifiedPrompt).toBe("1girl");
    expect(set.applied).toBe(0);
  });
});

describe("prompt assembly", () => {
  it("orders fixed blocks around the prompt and appends quality tags", () => {
    const rules = applyRules("1girl", "1girl | 前置前 | solo");
    const text = assemble(rules, {
      before: "masterpiece",
      after: "cinematic",
      quality: "best quality",
      qualityNegative: "lowres",
    });
    expect(text).toBe(
      "solo, masterpiece, 1girl, cinematic, best quality",
    );
  });

  it("puts negative quality tags first", () => {
    const rules = applyRules("blurry", "blurry | 后置后 | bad hands");
    const text = assembleNegative(rules, {
      ...emptyAssembly,
      qualityNegative: "lowres",
    });
    expect(text).toBe("lowres, blurry, bad hands");
  });

  it("collapses empty slots instead of leaving stray commas", () => {
    const text = assemble(applyRules("1girl", ""), {
      ...emptyAssembly,
      after: "cinematic",
    });
    expect(text).toBe("1girl, cinematic");
  });

  it("dedupes tags case-insensitively but keeps the first casing", () => {
    expect(dedupeTags("Best quality, best QUALITY ,, solo")).toBe(
      "Best quality, solo",
    );
  });

  it("returns the composed text and the rule report together", () => {
    const out = finalPrompt("1girl", "1girl | 前置前 | solo", {
      ...emptyAssembly,
      quality: "best quality",
    });
    expect(out.text).toBe("solo, 1girl, best quality");
    expect(out.rules.applied).toBe(1);
  });
});
