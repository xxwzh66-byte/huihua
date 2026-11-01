import { Languages } from "lucide-react";
import { t as tr } from "./i18n";

/**
 * v1.19: the app ships in Chinese only. The row used to open a modal offering
 * French and English; it now just states the language, so the setting stays
 * visible without pretending there is a choice.
 */
export default function LanguagePicker() {
  return (
    <div className="setting-row language-setting static">
      <Languages />
      <span>
        <strong>{tr("Langue de l’application")}</strong>
        <small>{tr("简体中文")}</small>
      </span>
    </div>
  );
}
