import { beforeEach, describe, expect, it } from "vitest";
import {
  TEMPLATE_LIMIT,
  deleteTemplate,
  duplicateTemplate,
  exportTemplates,
  importTemplates,
  newTemplate,
  readTemplates,
  renameTemplate,
  saveTemplate,
  templateById,
  templateName,
} from "./promptTemplates";

beforeEach(() => {
  const map = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => map.get(key) ?? null,
      setItem: (key: string, value: string) => map.set(key, String(value)),
      removeItem: (key: string) => map.delete(key),
    },
  });
});

describe("prompt template saving", () => {
  it("names blank templates and keeps them addressable", () => {
    expect(templateName("   ")).toBe("Modèle sans titre");
    expect(templateName("  Portrait   nuit  ")).toBe("Portrait nuit");
    const made = newTemplate("");
    expect(made.name).toBe("Modèle sans titre");
    expect(made.params).toEqual([]);
    saveTemplate(made);
    expect(templateById(made.id)?.name).toBe("Modèle sans titre");
  });

  it("duplicates under a fresh name without touching the original", () => {
    const first = newTemplate("Portrait");
    saveTemplate(first);
    const { name, list } = duplicateTemplate(first.id);
    expect(name).toBe("Portrait · copie");
    expect(list).toHaveLength(2);
    expect(templateById(first.id)?.name).toBe("Portrait");
    const again = duplicateTemplate(first.id);
    expect(again.name).toBe("Portrait · copie 2");
    expect(again.list).toHaveLength(3);
  });

  it("renames in place and deletes by id", () => {
    const made = newTemplate("Old");
    saveTemplate(made);
    renameTemplate(made.id, "New name");
    expect(templateById(made.id)?.name).toBe("New name");
    deleteTemplate(made.id);
    expect(readTemplates()).toHaveLength(0);
  });

  it("exports the whole set and imports it back under new ids", () => {
    saveTemplate(newTemplate("One"));
    saveTemplate(newTemplate("Two"));
    const text = exportTemplates();
    expect(JSON.parse(text).kind).toBe("huihua-templates");

    const map = new Map<string, string>();
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: {
        getItem: (key: string) => map.get(key) ?? null,
        setItem: (key: string, value: string) => map.set(key, String(value)),
        removeItem: (key: string) => map.delete(key),
      },
    });
    const added = importTemplates(text);
    expect(added).toHaveLength(2);
    expect(readTemplates()).toHaveLength(2);
    expect(() => importTemplates(text)).toThrow("Ces modèles existent déjà.");
    expect(() => importTemplates("not json")).toThrow("Ce fichier n’est pas du JSON.");
    expect(() => importTemplates('[{"name":"x"}]')).toThrow(
      "Aucun modèle valide dans ce fichier.",
    );
  });

  it("accepts a bare array and a single template object", () => {
    const one = newTemplate("Solo");
    expect(importTemplates(JSON.stringify([one]))).toHaveLength(1);
    const two = newTemplate("Pair");
    expect(importTemplates(JSON.stringify(two))).toHaveLength(1);
    expect(readTemplates()).toHaveLength(2);
    expect(TEMPLATE_LIMIT).toBe(100);
  });
});
