import { expect, test } from "vitest";
import { choices } from "./api";
import wardrobe from "./data/wardrobe.json";

test("upscalers accept legacy lists and modern COMBO options", () => {
  expect(choices({ N: { input: { required: { model: ["COMBO", { options: ["UltraSharp.pth"] }] } } } }, "N", "model")).toEqual(["UltraSharp.pth"]);
  expect(choices({ N: { input: { required: { model: [["UltraSharp.pth"]] } } } }, "N", "model")).toEqual(["UltraSharp.pth"]);
});

test("wardrobe library ships every slot with deduplicated, usable tags", () => {
  const ids = wardrobe.sections.map((s) => s.id);
  expect(ids).toEqual(["clothing", "scene", "pose", "expression"]);
  expect(wardrobe.sections.every((s) => s.groups.length > 0)).toBe(true);
  const tags = wardrobe.sections.flatMap((s) =>
    s.groups.flatMap((g) => g.items.flatMap((i) => i.tags)),
  );
  expect(tags.length).toBeGreaterThan(7000);
  expect(tags.every((tag) => tag.trim() === tag && tag.length > 0)).toBe(true);
  expect(wardrobe.sections.find((s) => s.id === "scene")?.groups.flatMap((g) => g.items.flatMap((i) => i.tags))).toContain("bedroom");
});
