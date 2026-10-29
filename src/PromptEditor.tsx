import TagWeight from "./TagWeight";
import { weightRange, setTagWeight, type WeightedRange } from "./promptWeights";
import "./prompt-blocks.css";
import PromptBoard from "./PromptBoard";
import { compilePrompt } from "./promptDocument";
import { t as tr } from "./i18n";
import PromptTranslation, { insertTranslation } from "./PromptTranslation";
import { useEffect, useRef, useState } from "react";
import { Check, Undo2, Redo2, Languages, SlidersHorizontal } from "lucide-react";
import { Modal } from "./components";
import PromptTools from "./PromptTools";
import {
  rememberPrompt,
  promptStorageError,
  type Prompts,
} from "./promptLibrary";
import "./prompt-experience.css";

type Side = keyof Prompts;
const sides: Side[] = ["positive", "negative"];

/**
 * v1.15 prompt editor: text or blocks, translation, weights, history and
 * reusable blocks. The offline Danbooru suggestion bubble, its autocomplete
 * switch and the voice assistant are gone — they only added chrome on a phone.
 */
export default function PromptEditor({
  initialTab,
  initialTool,
  fragmentTitle,
  values,
  onChange,
  onClose,
}: {
  initialTab: Side;
  fragmentTitle?: string;
  initialTool?: "history" | "blocks";
  values: Prompts;
  onChange: (values: Prompts) => void;
  onClose: () => void;
}) {
  const [layout, setLayout] = useState<"text" | "blocks">(() =>
    !fragmentTitle && /^\s*##[ \t]+/m.test(values[initialTab])
      ? "blocks"
      : "text",
  );
  const [weight, setWeight] = useState<WeightedRange | null | undefined>(
    undefined,
  );
  const weightSelection = useRef({ start: 0, end: 0 });
  const anchor = useRef<HTMLDivElement>(null);
  const [translation, setTranslation] = useState<
    { start: number; end: number } | null | undefined
  >(undefined);
  const translationSelection = useRef<{ start: number; end: number } | null>(
    null,
  );
  const [side, setSide] = useState(initialTab);
  const [caret, setCaret] = useState(values[initialTab].length);
  const [saveError, setSaveError] = useState("");
  const input = useRef<HTMLTextAreaElement>(null);
  const history = useRef<{ undo: Prompts[]; redo: Prompts[] }>({
    undo: [],
    redo: [],
  });
  const value = values[side];

  useEffect(() => {
    const viewport = window.visualViewport,
      dialog = anchor.current?.closest("dialog");
    const resize = () => {
      dialog?.style.setProperty(
        "--editor-height",
        `${viewport?.height ?? innerHeight}px`,
      );
      dialog?.classList.toggle(
        "compact-editor",
        (viewport?.height ?? innerHeight) < 560,
      );
      dialog?.style.setProperty(
        "--editor-top",
        `${viewport?.offsetTop ?? 0}px`,
      );
    };
    resize();
    viewport?.addEventListener("resize", resize);
    viewport?.addEventListener("scroll", resize);
    return () => {
      viewport?.removeEventListener("resize", resize);
      viewport?.removeEventListener("scroll", resize);
    };
  }, []);
  useEffect(() => {
    input.current?.focus();
    input.current?.setSelectionRange(caret, caret);
  }, [side, layout]);

  function focusAt(position: number) {
    setCaret(position);
    requestAnimationFrame(() => {
      input.current?.focus();
      input.current?.setSelectionRange(position, position);
    });
  }
  function update(next: Prompts) {
    if (next.positive === values.positive && next.negative === values.negative)
      return;
    history.current.undo.push({ ...values });
    if (history.current.undo.length > 80) history.current.undo.shift();
    history.current.redo = [];
    onChange(next);
    setSaveError("");
  }
  function travel(direction: "undo" | "redo") {
    const next = history.current[direction].pop();
    if (!next) return;
    history.current[direction === "undo" ? "redo" : "undo"].push({ ...values });
    onChange(next);
    focusAt(next[side].length);
  }
  function finish() {
    try {
      if (!fragmentTitle) rememberPrompt(values);
      onClose();
    } catch (reason) {
      setSaveError(promptStorageError(reason));
    }
  }
  function changeSide(next: Side) {
    setSide(next);
    setCaret(values[next].length);
  }

  return (
    <Modal
      title={fragmentTitle || tr("Écrire votre image")}
      className="prompt-editor"
      onClose={finish}
    >
      <div ref={anchor} />
      {!fragmentTitle && (
        <div className="editor-mode-bar">
          <div role="group" aria-label={tr("Affichage du prompt")}>
            <button
              aria-pressed={layout === "text"}
              onClick={() => setLayout("text")}
            >
              {tr("Texte")}
            </button>
            <button
              aria-pressed={layout === "blocks"}
              onClick={() => setLayout("blocks")}
            >
              {tr("Blocs")}
            </button>
          </div>
        </div>
      )}
      {layout === "text" && (
        <button
          className="prompt-translate-button"
          onPointerDown={() => {
            const field = input.current;
            translationSelection.current =
              field && document.activeElement === field
                ? { start: field.selectionStart, end: field.selectionEnd }
                : null;
          }}
          onClick={() => setTranslation(translationSelection.current)}
        >
          <Languages size={18} />
          {tr("Traduire des mots")}
        </button>
      )}
      {!fragmentTitle && (
        <PromptTools
          initialPage={initialTool}
          values={values}
          onChange={(next) => {
            update(next);
            setCaret(next[side].length);
            if (/^\s*##[ \t]+/m.test(next[side])) setLayout("blocks");
          }}
        />
      )}
      {!fragmentTitle && (
        <div
          className="editor-tabs"
          role="tablist"
          aria-label={tr("Type de prompt")}
        >
          {sides.map((tab, index) => (
            <button
              key={tab}
              id={`tab-${tab}`}
              role="tab"
              aria-selected={side === tab}
              aria-controls="prompt-panel"
              tabIndex={side === tab ? 0 : -1}
              onKeyDown={(event) => {
                if (
                  !["ArrowLeft", "ArrowRight", "Home", "End"].includes(
                    event.key,
                  )
                )
                  return;
                event.preventDefault();
                changeSide(
                  event.key === "Home"
                    ? "positive"
                    : event.key === "End"
                      ? "negative"
                      : tab === "positive"
                        ? "negative"
                        : "positive",
                );
              }}
              onClick={() => changeSide(tab)}
            >
              <span>0{index + 1}</span>
              {tab === "positive" ? tr("Positif") : tr("Négatif")}
              <small
                aria-label={tr("{0} caractères", [
                  compilePrompt(values[tab]).length,
                ])}
              >
                {compilePrompt(values[tab]).length}
              </small>
            </button>
          ))}
        </div>
      )}
      {layout === "blocks" ? (
        <PromptBoard
          key={side}
          side={side}
          value={value}
          onChange={(text) => update({ ...values, [side]: text })}
          editor={(text, title, change, close) => (
            <PromptEditor
              fragmentTitle={title}
              initialTab="positive"
              values={{ positive: text, negative: "" }}
              onChange={(next) => change(next.positive)}
              onClose={close}
            />
          )}
        />
      ) : (
        <div
          className="editor-paper"
          role={fragmentTitle ? "group" : "tabpanel"}
          id={fragmentTitle ? "prompt-panel-fragment" : "prompt-panel"}
          aria-labelledby={fragmentTitle ? undefined : `tab-${side}`}
          aria-label={fragmentTitle ? tr("Texte du bloc") : undefined}
        >
          <label className="sr-only" htmlFor="prompt-text">
            {fragmentTitle
              ? tr("Texte du bloc")
              : side === "positive"
                ? tr("Prompt positif")
                : tr("Prompt négatif")}
          </label>
          <textarea
            id="prompt-text"
            ref={input}
            value={value}
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            placeholder={
              side === "positive"
                ? tr(
                    "Imaginez la scène. Ajoutez des tags, des détails, une lumière…",
                  )
                : tr("Décrivez les éléments que vous souhaitez éviter…")
            }
            onChange={(event) => {
              update({ ...values, [side]: event.target.value });
              setCaret(event.target.selectionStart);
            }}
            onSelect={(event) => {
              setCaret(event.currentTarget.selectionStart);
              weightSelection.current = {
                start: event.currentTarget.selectionStart,
                end: event.currentTarget.selectionEnd,
              };
            }}
            onKeyDown={(event) => {
              if (
                (event.ctrlKey || event.metaKey) &&
                ["z", "y"].includes(event.key.toLowerCase())
              ) {
                event.preventDefault();
                travel(
                  event.shiftKey || event.key.toLowerCase() === "y"
                    ? "redo"
                    : "undo",
                );
              }
            }}
          />
        </div>
      )}
      {saveError && (
        <div className="editor-save-error" role="alert">
          <p>
            {saveError} {tr("Vos prompts restent appliqués.")}
          </p>
          <button onClick={onClose}>{tr("Fermer sans historique")}</button>
        </div>
      )}
      {translation !== undefined && (
        <PromptTranslation
          initial={
            translation ? value.slice(translation.start, translation.end) : ""
          }
          onClose={() => setTranslation(undefined)}
          onInsert={(text) => {
            const next = insertTranslation(value, text, translation);
            update({ ...values, [side]: next.text });
            setTranslation(undefined);
            focusAt(next.caret);
          }}
        />
      )}
      {weight !== undefined && (
        <TagWeight
          range={weight}
          onClose={() => setWeight(undefined)}
          onApply={(v) => {
            if (weight) {
              update({ ...values, [side]: setTagWeight(value, weight, v) });
            }
            setWeight(undefined);
          }}
        />
      )}
      <footer className="editor-footer">
        <div>
          {layout === "text" && (
            <button
              aria-label={tr("Poids du tag")}
              onPointerDown={() => {
                const el = input.current;
                weightSelection.current = {
                  start: el?.selectionStart ?? caret,
                  end: el?.selectionEnd ?? caret,
                };
              }}
              onClick={() =>
                setWeight(
                  weightRange(
                    value,
                    weightSelection.current.start,
                    weightSelection.current.end,
                  ),
                )
              }
            >
              <SlidersHorizontal size={19} />
            </button>
          )}
          <button
            aria-label={tr("Annuler la dernière modification")}
            disabled={!history.current.undo.length}
            onClick={() => travel("undo")}
          >
            <Undo2 size={19} />
          </button>
          <button
            aria-label={tr("Rétablir la modification")}
            disabled={!history.current.redo.length}
            onClick={() => travel("redo")}
          >
            <Redo2 size={19} />
          </button>
        </div>
        <button className="primary" onClick={finish}>
          <Check size={18} /> {tr("Terminé")}{" "}
        </button>
      </footer>
    </Modal>
  );
}
