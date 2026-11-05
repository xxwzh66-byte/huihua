import { test, expect, beforeEach } from "vitest";
import { appendBlock, checkPrompts, rememberPrompt, readPromptLibrary } from "./promptLibrary";
beforeEach(() => { const map = new Map<string, string>(); Object.defineProperty(globalThis, "localStorage", { configurable: true, value: { getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => map.set(k, v) } }); });
test("checker normalizes weights and spaces without substring false positives", () => {
  expect(checkPrompts({ positive: "(sun:1.2), blue_sky", negative: "SUN, blue sky" })).toHaveLength(2);
  expect(checkPrompts({ positive: "sun, daytime", negative: "sunset, nighttime" })).toEqual([]);
  expect(checkPrompts({ positive: "daytime, nighttime", negative: "" })[0]).toContain("peuvent se contredire");
});
test("history deduplicates, persists both sides and retains newest 100", () => {
  for (let i = 0; i < 103; i++) rememberPrompt({ positive: `lake ${i}`, negative: "blur" });
  rememberPrompt({ positive: "lake 101", negative: "blur" });
  const list = readPromptLibrary("history"); expect(list).toHaveLength(100); expect(list[0].positive).toBe("lake 101"); expect(list[0].negative).toBe("blur");
  expect(appendBlock("lake, ", "soft_light, ")).toBe("lake, soft_light, ");
  expect(appendBlock("lake", " ")).toBe("lake");
});
