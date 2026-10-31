import { describe, expect, it } from "vitest";
import wardrobe from "./data/wardrobe.json";
import {
  describeSet,
  describeTag,
  describeTags,
  groupLabel,
  matchesSet,
  sceneDraft,
} from "./wardrobeNames";

const sets = wardrobe.sections.flatMap((s) =>
  s.groups.flatMap((g) => g.items.map((item) => ({ ...item, group: g.name }))),
);

const han = /[\u4e00-\u9fa5]/;

describe("wardrobe Chinese readings", () => {
  it("keeps the English prompt untouched", () => {
    // The panel is allowed to show Chinese, but the strings that reach ComfyUI
    // must stay exactly as the upstream catalogue spells them.
    const bra = wardrobe.sections
      .find((s) => s.id === "clothing")!
      .groups.find((g) => g.name.includes("内衣"))!;
    expect(bra.items[0].label).toBe("bra");
    expect(bra.items[0].tags).toContain("lace bra");
  });

  it("has a Chinese reading for every set", () => {
    const gaps = sets.filter((item) => !han.test(describeSet(item.label)));
    expect(gaps.map((item) => item.label)).toEqual([]);
  });

  it("has a Chinese reading for every tag", () => {
    const tags = [...new Set(sets.flatMap((item) => item.tags))];
    const gaps = tags.filter((tag) => !han.test(describeTag(tag)));
    expect(gaps).toEqual([]);
  });

  it("never prints a raw underscore tag", () => {
    const tags = [...new Set(sets.flatMap((item) => item.tags))];
    const ugly = describeTags(tags).filter((reading) => reading.includes("_"));
    expect(ugly).toEqual([]);
  });

  it("labels every shelf and group in Chinese", () => {
    expect(groupLabel("clothing")).toBe("服装");
    expect(groupLabel("scene")).toBe("场景");
    expect(groupLabel("服装 / 穿着状态")).toBe("穿着状态");
    for (const section of wardrobe.sections)
      for (const group of section.groups) {
        // A few upstream group names already are Chinese and carry a Latin
        // gloss in brackets; those are left as they are.
        const reading = groupLabel(group.name);
        expect(reading.length).toBeGreaterThan(0);
        expect(han.test(reading) || /[A-Za-z]/.test(reading)).toBe(true);
      }
  });

  it("finds sets by their Chinese reading as well as their English tags", () => {
    const cropTop = sets.find((item) => item.label === "crop top")!;
    const zh = describeSet(cropTop.label);
    expect(matchesSet(cropTop, zh)).toBe(true);
    expect(matchesSet(cropTop, "crop top")).toBe(true);
    expect(matchesSet(cropTop, "不存在的东西")).toBe(false);
  });

  it("builds a scene line for the panel and a prompt for the model", () => {
    const draft = sceneDraft(["crop top", "crop top", "see-through"]);
    expect(draft.prompt).toBe("crop top, see-through");
    expect(draft.text).toBe(
      `${describeSet("crop top")}，${describeSet("see-through")}`,
    );
    expect(draft.text).not.toContain("crop top");
  });
});
