import { useSyncExternalStore } from "react";
import english from "./locales/en.json";
import chinese from "./locales/zh-CN.json";
export type Locale = "fr" | "en" | "zh-CN";
const dictionaries: Partial<Record<Locale, Record<string, string>>> = {
  en: english as Record<string, string>,
  "zh-CN": chinese as Record<string, string>,
};
let language: Locale = "zh-CN";
try {
  const saved = localStorage.getItem("mochi-language");
  if (saved === "fr" || saved === "en" || saved === "zh-CN") language = saved;
} catch {
  /* Session preference remains available. */
}
const listeners = new Set<() => void>();
export const locale = () => language;
export function useLocale() {
  return useSyncExternalStore((callback) => {
    listeners.add(callback);
    return () => {
      listeners.delete(callback);
    };
  }, locale);
}
export function setLocale(next: Locale) {
  localStorage.setItem("mochi-language", next);
  language = next;
  document.documentElement.lang = next;
  listeners.forEach((listener) => listener());
}
if (typeof document !== "undefined") document.documentElement.lang = language;
export function t(source: string, values: readonly unknown[] = []): string {
  const dictionary = dictionaries[language];
  const translated = (dictionary && dictionary[source]) ?? source;
  return translated.replace(/\{(\d+)\}/g, (match, index: string) =>
    Number(index) < values.length ? String(values[Number(index)]) : match,
  );
}
