import { t as tr } from "./i18n";

export type TemplateParam = {
  key: string;
  label: string;
  kind: "select" | "text";
  options?: string[];
};

export type PromptTemplate = {
  id: string;
  name: string;
  description: string;
  systemPrompt: string;
  params: TemplateParam[];
  body: string;
  source?: string;
  at: number;
};

const STORE = "prompt-templates-v1";
export const TEMPLATE_LIMIT = 100;
const FIELD_LIMIT = 40_000;

function isParam(value: unknown): value is TemplateParam {
  if (!value || typeof value !== "object") return false;
  const p = value as Partial<TemplateParam>;
  return (
    typeof p.key === "string" &&
    p.key.length > 0 &&
    p.key.length <= 60 &&
    typeof p.label === "string" &&
    p.label.length <= 80 &&
    (p.kind === "select" || p.kind === "text") &&
    (p.options === undefined ||
      (Array.isArray(p.options) &&
        p.options.length <= 400 &&
        p.options.every((o) => typeof o === "string" && o.length <= 120)))
  );
}

function isTemplate(value: unknown): value is PromptTemplate {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<PromptTemplate>;
  return (
    typeof item.id === "string" &&
    item.id.length > 0 &&
    item.id.length <= 100 &&
    typeof item.name === "string" &&
    item.name.length > 0 &&
    item.name.length <= 120 &&
    typeof item.description === "string" &&
    item.description.length <= FIELD_LIMIT &&
    typeof item.systemPrompt === "string" &&
    item.systemPrompt.length <= FIELD_LIMIT &&
    typeof item.body === "string" &&
    item.body.length <= FIELD_LIMIT &&
    Array.isArray(item.params) &&
    item.params.length <= 12 &&
    item.params.every(isParam) &&
    typeof item.at === "number" &&
    Number.isFinite(item.at)
  );
}

export function readTemplates(): PromptTemplate[] {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(STORE);
  } catch {
    return [];
  }
  let data: unknown;
  try {
    data = JSON.parse(raw ?? "[]");
  } catch {
    return [];
  }
  if (!Array.isArray(data) || data.length > TEMPLATE_LIMIT) return [];
  return data.filter(isTemplate);
}

export function writeTemplates(entries: PromptTemplate[]) {
  if (entries.length > TEMPLATE_LIMIT)
    throw new Error(tr("Limite de 100 modèles atteinte."));
  if (!entries.every(isTemplate)) throw new Error(tr("Modèle invalide."));
  localStorage.setItem(STORE, JSON.stringify(entries));
}

export function saveTemplate(entry: PromptTemplate) {
  const others = readTemplates().filter((t) => t.id !== entry.id);
  const next = [entry, ...others].slice(0, TEMPLATE_LIMIT);
  writeTemplates(next);
  return next;
}

export function deleteTemplate(id: string) {
  const next = readTemplates().filter((t) => t.id !== id);
  writeTemplates(next);
  return next;
}

export function templateById(id: string) {
  return readTemplates().find((t) => t.id === id) ?? null;
}

/** Replace {{key}} placeholders; unknown keys are left untouched. */
export function renderTemplate(
  template: PromptTemplate,
  values: Record<string, string>,
) {
  return template.body.replace(/\{\{\s*([a-zA-Z0-9_-]{1,60})\s*\}\}/g, (all, key: string) =>
    values[key]?.trim() ? values[key].trim() : all,
  );
}

export function skillPrompt(template: PromptTemplate, description: string) {
  const lines = [
    template.systemPrompt.trim(),
    template.description.trim() ? `Template intent: ${template.description.trim()}` : "",
    template.params.length
      ? `Optional choices: ${template.params
          .map((p) => `${p.label}=[${(p.options ?? []).slice(0, 40).join("|")}]`)
          .join("; ")}`
      : "",
    `Scene: ${description}`,
  ];
  return lines.filter(Boolean).join("\n");
}

/* ------------------------------ SKILL import ------------------------------ */

export type SkillFile = { name: string; text: string };

type FrontMatter = Record<string, string>;

function frontMatter(text: string): { meta: FrontMatter; body: string } {
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!match) return { meta: {}, body: text };
  const meta: FrontMatter = {};
  for (const line of match[1].split(/\r?\n/)) {
    const pair = line.match(/^([A-Za-z0-9_-]{1,40})\s*:\s*(.+)$/);
    if (pair) meta[pair[1].toLowerCase()] = pair[2].trim().replace(/^["']|["']$/g, "");
  }
  return { meta, body: text.slice(match[0].length) };
}

/** First CSV column, header skipped, deduplicated, bounded. */
function csvColumn(text: string): string[] {
  const seen = new Set<string>();
  const values: string[] = [];
  for (const line of text.replace(/\r/g, "").split("\n").slice(1)) {
    const cell = line.split(/[,\t]/)[0]?.trim().replace(/^"|"$/g, "");
    if (!cell || cell.length > 120 || seen.has(cell)) continue;
    seen.add(cell);
    values.push(cell);
    if (values.length >= 400) break;
  }
  return values;
}

const MAX_SKILL_FILES = 400;
const MAX_SKILL_BYTES = 6_000_000;

/**
 * A "skill" is a folder holding `SKILL.md` (front-matter + prose) plus optional
 * `data/*.csv` vocabularies. The markdown becomes the system prompt, each CSV
 * becomes a dropdown, giving one reusable template per imported skill.
 */
export function importSkill(files: SkillFile[]): PromptTemplate {
  if (!files.length) throw new Error(tr("Aucun fichier sélectionné."));
  if (files.length > MAX_SKILL_FILES) throw new Error(tr("Trop de fichiers à importer."));
  let bytes = 0;
  for (const file of files) {
    bytes += file.name.length + file.text.length;
    if (bytes > MAX_SKILL_BYTES) throw new Error(tr("Import trop volumineux."));
  }
  const md = files.find((f) => /(^|\/)SKILL\.md$/i.test(f.name)) ?? files.find((f) => /\.md$/i.test(f.name));
  if (!md) throw new Error(tr("SKILL.md introuvable dans le dossier importé."));
  const { meta, body } = frontMatter(md.text);
  const text = body.trim();
  if (!text) throw new Error(tr("SKILL.md est vide."));

  const params: TemplateParam[] = [];
  const used = new Set<string>();
  for (const file of files) {
    if (!/\.csv$/i.test(file.name)) continue;
    const options = csvColumn(file.text);
    if (options.length < 2) continue;
    const base = file.name.split(/[\\/]/).pop()!.replace(/\.csv$/i, "").replace(/[^A-Za-z0-9_-]/g, "_");
    let key = base.toLowerCase();
    let suffix = 2;
    while (used.has(key)) key = `${base.toLowerCase()}_${suffix++}`;
    used.add(key);
    params.push({
      key,
      label: base.replace(/[_-]/g, " "),
      kind: "select",
      options,
    });
    if (params.length >= 8) break;
  }

  const name = (meta.name || md.name.split(/[\\/]/).pop()!.replace(/\.md$/i, "")).slice(0, 120);
  return {
    id: crypto.randomUUID(),
    name,
    description: (
      meta.description ||
      text.split(/\r?\n/).find((l) => l.trim() && !l.startsWith("#"))?.trim() ||
      ""
    ).slice(0, 400),
    systemPrompt: text.slice(0, FIELD_LIMIT),
    params,
    body:
      meta.template?.trim() ||
      [name, ...params.map((p) => `{{${p.key}}}`)].join(", ").slice(0, FIELD_LIMIT),
    source: md.name,
    at: Date.now(),
  };
}

export async function readSkillFiles(list: FileList | File[]): Promise<SkillFile[]> {
  const files = Array.from(list).slice(0, MAX_SKILL_FILES);
  const out: SkillFile[] = [];
  for (const file of files) {
    if (!/\.(md|csv)$/i.test(file.name)) continue;
    if (file.size > 2_000_000) continue;
    out.push({
      name: (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name,
      text: await file.text(),
    });
  }
  return out;
}
