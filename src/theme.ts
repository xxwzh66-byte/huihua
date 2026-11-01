/**
 * Appearance themes (v1.19).
 *
 * The stylesheets are written around a handful of CSS variables, but plenty of
 * rules still hardcode white. Themes therefore do two things: they swap the
 * variables and they switch a `data-theme` attribute that `theme.css` uses for
 * the surfaces that were written with literal colours.
 */
export type ThemeId = "pure" | "warm" | "mint" | "ink" | "night";

export interface ThemeOption {
  id: ThemeId;
  /** French source string, translated through `t()`. */
  label: string;
  /** Two swatches drawn in the settings row. */
  preview: [string, string];
}

export const THEMES: ThemeOption[] = [
  { id: "pure", label: "Blanc pur", preview: ["#ffffff", "#1b1b1b"] },
  { id: "warm", label: "Papier chaud", preview: ["#faf5ec", "#4a3b2a"] },
  { id: "mint", label: "Menthe", preview: ["#eef6f2", "#16302a"] },
  { id: "ink", label: "Encre douce", preview: ["#f4f5f7", "#22252c"] },
  { id: "night", label: "Nuit", preview: ["#15171c", "#e8e9ee"] },
];

export const THEME_KEY = "mochi-theme";

export function isTheme(value: unknown): value is ThemeId {
  return THEMES.some((option) => option.id === value);
}

export function readTheme(): ThemeId {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    if (isTheme(saved)) return saved;
  } catch {
    /* The default theme stays usable without storage. */
  }
  return "pure";
}

/** Paint `<html data-theme>` so plain CSS can react without a re-render. */
export function applyTheme(theme: ThemeId) {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.theme = theme;
}

export function saveTheme(theme: ThemeId): boolean {
  applyTheme(theme);
  try {
    localStorage.setItem(THEME_KEY, theme);
    return true;
  } catch {
    return false;
  }
}

export function themeLabel(id: ThemeId): string {
  return THEMES.find((option) => option.id === id)?.label ?? THEMES[0].label;
}
