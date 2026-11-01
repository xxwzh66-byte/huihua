import { useState } from "react";
import { Palette, Check, ChevronRight } from "lucide-react";
import { Modal } from "./Modal";
import { t as tr } from "./i18n";
import { THEMES, type ThemeId, themeLabel } from "./theme";

/**
 * Appearance picker (v1.19). The app used to show a static "Blanc pur · Clair"
 * row that could not be touched; the row is now a real picker over the themes
 * declared in `theme.ts`.
 */
export default function Appearance({ theme, onTheme }: { theme: ThemeId; onTheme: (next: ThemeId) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="setting-row theme-row" onClick={() => setOpen(true)}>
        <Palette />
        <span>
          <strong>{tr("Apparence")}</strong>
          <small>{tr(themeLabel(theme))}</small>
        </span>
        <ChevronRight />
      </button>
      {open && (
        <Modal
          title={tr("Apparence")}
          className="theme-dialog"
          onClose={() => setOpen(false)}
        >
          <div className="theme-options" role="radiogroup" aria-label={tr("Apparence")}>
            {THEMES.map((option) => (
              <button
                key={option.id}
                role="radio"
                aria-checked={theme === option.id}
                onClick={() => {
                  onTheme(option.id);
                  setOpen(false);
                }}
              >
                <span
                  className="theme-swatch"
                  style={{
                    background: option.preview[0],
                    borderColor: option.preview[1],
                  }}
                >
                  <span style={{ background: option.preview[1] }} />
                </span>
                <strong>{tr(option.label)}</strong>
                {theme === option.id && <Check size={20} />}
              </button>
            ))}
          </div>
        </Modal>
      )}
    </>
  );
}
