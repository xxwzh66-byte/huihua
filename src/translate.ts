import { llmChat, llmGet, llmReady, type LlmView } from "./llm";
import { t as tr } from "./i18n";

/**
 * Prompt translation over the user's own chat API.
 *
 * The device engine (ML Kit) only exists on Android and only ever learns
 * generic sentences; image prompts are a different dialect — half the text is
 * Danbooru tags that must survive untouched, and the other half is Chinese
 * prose that must become tag-shaped English. So the API path is instructed to
 * edit nothing but the prose.
 */

export const LANGUAGE_NAMES: Record<string, string> = {
  fr: "French",
  en: "English",
  de: "German",
  es: "Spanish",
  it: "Italian",
  pt: "Portuguese",
  ja: "Japanese",
  ko: "Korean",
  zh: "Chinese",
  ru: "Russian",
  ar: "Arabic",
  nl: "Dutch",
};

export const MAX_TRANSLATE = 5000;

export function languageName(code: string): string {
  return LANGUAGE_NAMES[code] ?? code;
}

/** True when the string still holds something worth sending. */
export function translatable(text: string, source: string, target: string): boolean {
  return source !== target && text.trim().length > 0;
}

const FENCE = /^```[a-z]*\s*\n?([\s\S]*?)\n?```$/i;

/** Models like to wrap answers in quotes or fences; prompts want neither. */
export function cleanAnswer(raw: string): string {
  let text = String(raw ?? "").trim();
  const fenced = text.match(FENCE);
  if (fenced) text = fenced[1].trim();
  if (
    text.length > 1 &&
    ((text.startsWith('"') && text.endsWith('"')) ||
      (text.startsWith("“") && text.endsWith("”")))
  ) {
    text = text.slice(1, -1).trim();
  }
  return text;
}

export function translationSystem(source: string, target: string): string {
  return [
    `You translate image-generation prompts from ${languageName(source)} to ${languageName(target)}.`,
    "Keep every Danbooru tag, <lora:...> block, (tag:1.2) weight, bracket, comma and line break exactly as written; only translate natural-language prose.",
    "If the text is already in the target language, return it unchanged.",
    "Answer with the translation only: no quotes, no fence, no explanation.",
  ].join(" ");
}

export async function translateWithApi(
  text: string,
  source: string,
  target: string,
): Promise<string> {
  const trimmed = text.trim();
  if (!trimmed) return "";
  if (trimmed.length > MAX_TRANSLATE)
    throw new Error(tr("Texte invalide (1 à 5 000 caractères)"));
  if (!translatable(trimmed, source, target)) return text;
  const view = await llmGet().catch(() => null as LlmView | null);
  if (!llmReady(view))
    throw new Error(
      tr("Configurez d’abord une API de génération dans les réglages."),
    );
  const reply = await llmChat(
    [
      { role: "system", content: translationSystem(source, target) },
      { role: "user", content: trimmed },
    ],
    false,
  );
  const answer = cleanAnswer(reply.content);
  if (!answer) throw new Error(tr("L’API n’a rien renvoyé."));
  return answer.slice(0, MAX_TRANSLATE * 2);
}

export type TranslateEngine = "auto" | "device" | "api";

export function engineLabel(engine: TranslateEngine): string {
  if (engine === "device") return tr("Appareil");
  if (engine === "api") return tr("API");
  return tr("Automatique");
}
