import { useState } from "react";
import { History, Languages, Sparkles } from "lucide-react";
import { t as tr } from "./i18n";
import type { Settings } from "./workflow";
import PromptEditor from "./PromptEditor";
import PromptTranslation from "./PromptTranslation";
import "./prompt-section.css";

/**
 * The prompt card of the Atelier. It survives the removal of the automatic
 * mode: the text written here feeds `{{prompt}}` inside the imported API
 * workflow, so the workflow keeps working on its own.
 */
export default function PromptSection({
  settings: s,
  onChange,
  onGlossary,
  onGenerate,
}: {
  settings: Settings;
  onChange: (next: Settings) => void;
  onGlossary: () => void;
  onGenerate: () => void;
}) {
  const [editor, setEditor] = useState<"positive" | "negative" | null>(null);
  const [tool, setTool] = useState<"history" | "blocks" | undefined>();
  // v1.21: translating the whole prompt was only reachable inside the editor,
  // after remembering a selection. This shortcut translates the active side.
  const [translating, setTranslating] = useState<"positive" | "negative" | null>(
    null,
  );
  const openEditor = (
    side: "positive" | "negative",
    nextTool?: "history" | "blocks",
  ) => {
    setTool(nextTool);
    setEditor(side);
  };
  const translatableSide = s.positive.trim()
    ? "positive"
    : s.negative.trim()
      ? "negative"
      : null;

  return (
    <>
      <section
        id="studio-prompts"
        tabIndex={-1}
        className="studio-prompts"
        aria-label="Prompts"
      >
        <div className="studio-section-heading">
          <h2>{tr("Les mots font l’image")}</h2>
          <button
            className="inline-action"
            onClick={() => openEditor("positive", "history")}
          >
            <History size={13} /> {tr("Historique")}{" "}
          </button>
        </div>
        <button
          className="prompt-entry prompt-launch positive-entry"
          aria-label={tr("Votre idée")}
          onClick={() => openEditor("positive")}
        >
          <small>{tr("POSITIF")}</small>
          <span>
            {s.positive || tr("Une scène, une lumière, une émotion…")}
          </span>
        </button>
        <div className="prompt-shortcuts">
          <button onClick={() => openEditor("positive", "blocks")}>
            {" "}
            {tr("+ Bloc réutilisable")}{" "}
          </button>
          <button onClick={onGlossary}>{tr("Ouvrir la garde-robe")}</button>
          {translatableSide && (
            <button
              aria-label={tr("Traduire le prompt")}
              onClick={() => setTranslating(translatableSide)}
            >
              <Languages size={13} /> {tr("Traduire")}
            </button>
          )}
          <button onClick={onGenerate}>
            <Sparkles size={13} /> {tr("用 API 生成提示词")}
          </button>
        </div>
        <button
          className="prompt-entry prompt-launch negative-entry"
          aria-label={tr("Prompt négatif")}
          onClick={() => openEditor("negative")}
        >
          <small>{tr("NÉGATIF")}</small>
          <span>{s.negative || tr("Ce que vous préférez éviter…")}</span>
        </button>
      </section>
      {editor && (
        <PromptEditor
          initialTab={editor}
          initialTool={tool}
          values={{ positive: s.positive, negative: s.negative }}
          onChange={(v) => onChange({ ...s, ...v })}
          onClose={() => setEditor(null)}
        />
      )}
      {translating && (
        <PromptTranslation
          initial={s[translating]}
          initialTarget="en"
          onClose={() => setTranslating(null)}
          onInsert={(text) => {
            onChange({ ...s, [translating]: text });
            setTranslating(null);
          }}
        />
      )}
    </>
  );
}
