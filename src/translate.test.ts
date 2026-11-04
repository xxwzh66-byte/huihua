import { describe, expect, it } from "vitest";
import {
  MAX_TRANSLATE,
  cleanAnswer,
  languageName,
  translatable,
  translationSystem,
} from "./translate";

describe("API prompt translation", () => {
  it("strips fences and quotes a model wraps around its answer", () => {
    expect(cleanAnswer("```\nblue sky\n```")).toBe("blue sky");
    expect(cleanAnswer('```text\nblue sky\n```')).toBe("blue sky");
    expect(cleanAnswer('"blue sky"')).toBe("blue sky");
    expect(cleanAnswer("“蓝天”")).toBe("蓝天");
    expect(cleanAnswer("  blue sky  ")).toBe("blue sky");
    expect(cleanAnswer("")).toBe("");
  });

  it("only sends text that actually needs translating", () => {
    expect(translatable("蓝天", "zh", "en")).toBe(true);
    expect(translatable("blue sky", "en", "en")).toBe(false);
    expect(translatable("   ", "zh", "en")).toBe(false);
    expect(MAX_TRANSLATE).toBe(5000);
  });

  it("names the engine languages and tells the model what to preserve", () => {
    expect(languageName("zh")).toBe("Chinese");
    expect(languageName("en")).toBe("English");
    expect(languageName("xx")).toBe("xx");
    const system = translationSystem("zh", "en");
    expect(system).toContain("Chinese to English");
    expect(system).toContain("<lora:...>");
    expect(system).toContain("no quotes, no fence, no explanation");
  });
});
