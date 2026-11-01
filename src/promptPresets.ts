import { readStored, writeStored } from "./sessionStorage";
import { t as tr } from "./i18n";
import type { Assembly } from "./promptRules";
import { emptyAssembly } from "./promptRules";

/**
 * Three named collections, mirroring the ComfyUI panel of st-chatu8:
 *   fix      fixed prompt blocks (before / after / quality tags)
 *   rules    prompt-replacement rule sheets
 *   profile  a full snapshot: fix + rules + settings + workflow name
 * Each is an ordered list of `{ id, name, ... }` entries in localStorage.
 */

const LIMIT = 80;
const NAME_LIMIT = 120;

export interface FixPreset {
  id: string;
  name: string;
  at: number;
  assembly: Assembly;
}

export interface RulePreset {
  id: string;
  name: string;
  at: number;
  text: string;
}

export interface ProfilePayload {
  assembly: Assembly;
  rulesText: string;
  settings: unknown;
  workflowName: string;
  fixId: string;
  rulesId: string;
}

export interface Profile {
  id: string;
  name: string;
  at: number;
  payload: ProfilePayload;
}

const KEYS = {
  fix: "prompt-fix-presets-v1",
  rules: "prompt-rule-presets-v1",
  profile: "prompt-profiles-v1",
} as const;

type Kind = keyof typeof KEYS;

const cleanName = (name: string) =>
  name.trim().slice(0, NAME_LIMIT) || tr("Sans titre");

function read<T>(kind: Kind): T[] {
  const stored = readStored<T[]>(KEYS[kind], []);
  if (!Array.isArray(stored)) return [];
  return stored.filter((item) => {
    if (!item || typeof item !== "object") return false;
    const entry = item as { id?: unknown; name?: unknown };
    return typeof entry.id === "string" && typeof entry.name === "string";
  }).slice(0, LIMIT);
}

function write<T>(kind: Kind, list: T[]): T[] {
  if (!writeStored(KEYS[kind], list.slice(0, LIMIT)))
    throw new Error(
      tr("L’enregistrement local est indisponible sur cet appareil."),
    );
  return list.slice(0, LIMIT);
}

function normalizeAssembly(value: unknown): Assembly {
  if (!value || typeof value !== "object") return { ...emptyAssembly };
  const raw = value as Partial<Assembly>;
  const text = (input: unknown) => (typeof input === "string" ? input : "");
  return {
    before: text(raw.before),
    after: text(raw.after),
    quality: text(raw.quality),
    qualityNegative: text(raw.qualityNegative),
  };
}

export function readFixPresets(): FixPreset[] {
  return read<FixPreset>("fix").map((item) => ({
    id: item.id,
    name: item.name,
    at: typeof item.at === "number" ? item.at : 0,
    assembly: normalizeAssembly((item as Partial<FixPreset>).assembly),
  }));
}

export function saveFixPreset(
  name: string,
  assembly: Assembly,
  id?: string,
): FixPreset {
  const entry: FixPreset = {
    id: id || crypto.randomUUID(),
    name: cleanName(name),
    at: Date.now(),
    assembly: normalizeAssembly(assembly),
  };
  const list = readFixPresets();
  write("fix", [entry, ...list.filter((item) => item.id !== entry.id)]);
  return entry;
}

export function deleteFixPreset(id: string) {
  write(
    "fix",
    readFixPresets().filter((item) => item.id !== id),
  );
}

export function readRulePresets(): RulePreset[] {
  return read<RulePreset>("rules").map((item) => ({
    id: item.id,
    name: item.name,
    at: typeof item.at === "number" ? item.at : 0,
    text: typeof (item as Partial<RulePreset>).text === "string" ? (item as RulePreset).text : "",
  }));
}

export function saveRulePreset(
  name: string,
  text: string,
  id?: string,
): RulePreset {
  const entry: RulePreset = {
    id: id || crypto.randomUUID(),
    name: cleanName(name),
    at: Date.now(),
    text,
  };
  const list = readRulePresets();
  write("rules", [entry, ...list.filter((item) => item.id !== entry.id)]);
  return entry;
}

export function deleteRulePreset(id: string) {
  write(
    "rules",
    readRulePresets().filter((item) => item.id !== id),
  );
}

export function readProfiles(): Profile[] {
  return read<Profile>("profile").map((item) => {
    const raw = (item as Partial<Profile>).payload;
    const payload =
      raw && typeof raw === "object" ? (raw as Partial<ProfilePayload>) : {};
    return {
      id: item.id,
      name: item.name,
      at: typeof item.at === "number" ? item.at : 0,
      payload: {
        assembly: normalizeAssembly(payload.assembly),
        rulesText: typeof payload.rulesText === "string" ? payload.rulesText : "",
        settings: payload.settings ?? null,
        workflowName:
          typeof payload.workflowName === "string" ? payload.workflowName : "",
        fixId: typeof payload.fixId === "string" ? payload.fixId : "",
        rulesId: typeof payload.rulesId === "string" ? payload.rulesId : "",
      },
    };
  });
}

export function saveProfile(
  name: string,
  payload: ProfilePayload,
  id?: string,
): Profile {
  const entry: Profile = {
    id: id || crypto.randomUUID(),
    name: cleanName(name),
    at: Date.now(),
    payload: { ...payload, assembly: normalizeAssembly(payload.assembly) },
  };
  const list = readProfiles();
  write("profile", [entry, ...list.filter((item) => item.id !== entry.id)]);
  return entry;
}

export function deleteProfile(id: string) {
  write(
    "profile",
    readProfiles().filter((item) => item.id !== id),
  );
}
