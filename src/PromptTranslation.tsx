import { t as tr } from "./i18n";
import { useRef, useState, useEffect } from "react";
import { Languages, ArrowLeftRight, LoaderCircle } from "lucide-react";
import { Modal } from "./Modal";
import { native } from "./api";
import {
  engineLabel,
  translateWithApi,
  type TranslateEngine,
} from "./translate";

const languages = {
  fr: "Français",
  en: "English",
  de: "Deutsch",
  es: "Español",
  it: "Italiano",
  pt: "Português",
  ja: "日本語",
  ko: "한국어",
  zh: "中文",
  ru: "Русский",
  ar: "العربية",
  nl: "Nederlands",
};
export function insertTranslation(
  value: string,
  text: string,
  selection: { start: number; end: number } | null,
) {
  const start = Math.min(selection?.start ?? value.length, value.length);
  const end = Math.min(selection?.end ?? value.length, value.length);
  const before = value.slice(0, start),
    after = value.slice(end);
  const inserted =
    (before && !/[\s,(]$/.test(before) ? " " : "") +
    text.trim() +
    (after && !/^[\s,.)]/.test(after) ? " " : "");
  return { text: before + inserted + after, caret: start + inserted.length };
}

/**
 * v1.21: two engines behind one dialog. The device engine (ML Kit) is offline
 * and free but Android-only; the API engine reuses the chat API already
 * configured for prompt generation and works everywhere, and it is told to
 * leave tags and weights untouched. "Automatique" tries the device first and
 * falls back to the API, which is also what makes desktop builds translate.
 */
export default function PromptTranslation({
  initial,
  initialTarget,
  onInsert,
  onClose,
}: {
  initial: string;
  initialTarget?: string;
  onInsert: (text: string) => void;
  onClose: () => void;
}) {
  const [text, setText] = useState(initial),
    [source, setSource] = useState("zh"),
    [target, setTarget] = useState(initialTarget ?? "en");
  const [engine, setEngine] = useState<TranslateEngine>("auto");
  const [result, setResult] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [used, setUsed] = useState(""),
    [cellular, setCellular] = useState(false);
  const revision = useRef(0),
    locked = useRef(false);
  useEffect(
    () => () => {
      revision.current++;
    },
    [],
  );

  async function deviceTranslate() {
    const answer = await native<{ text: string }>("translate_text", {
      text,
      source,
      target,
      cellular,
    });
    return String(answer?.text ?? "");
  }

  async function translate() {
    if (locked.current) return;
    locked.current = true;
    const request = ++revision.current;
    setBusy(true);
    setError("");
    setResult("");
    setUsed("");
    try {
      let translated = text;
      if (source !== target) {
        if (engine === "device") {
          translated = await deviceTranslate();
          if (request === revision.current) setUsed("device");
        } else if (engine === "api") {
          translated = await translateWithApi(text, source, target);
          if (request === revision.current) setUsed("api");
        } else {
          try {
            translated = await deviceTranslate();
            if (request === revision.current) setUsed("device");
          } catch {
            translated = await translateWithApi(text, source, target);
            if (request === revision.current) setUsed("api");
          }
        }
      }
      if (request === revision.current) setResult(translated);
    } catch (e) {
      if (request === revision.current) setError(String(e));
    } finally {
      locked.current = false;
      if (request === revision.current) setBusy(false);
    }
  }

  return (
    <Modal
      title={tr("Traduire des mots")}
      className="translation-dialog"
      onClose={onClose}
    >
      <div className="translation-languages">
        <label>
          {tr("Depuis")}
          <select
            disabled={busy}
            value={source}
            onChange={(e) => {
              setSource(e.target.value);
              setResult("");
            }}
          >
            {Object.entries(languages).map(([code, name]) => (
              <option key={code} value={code}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <button
          aria-label={tr("Inverser les langues")}
          disabled={busy}
          onClick={() => {
            setSource(target);
            setTarget(source);
            setResult("");
          }}
        >
          <ArrowLeftRight size={18} />
        </button>
        <label>
          {tr("Vers")}
          <select
            disabled={busy}
            value={target}
            onChange={(e) => {
              setTarget(e.target.value);
              setResult("");
            }}
          >
            {Object.entries(languages).map(([code, name]) => (
              <option key={code} value={code}>
                {name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="translation-engine">
        {tr("Moteur")}
        <select
          disabled={busy}
          value={engine}
          onChange={(e) => {
            setEngine(e.target.value as TranslateEngine);
            setResult("");
            setUsed("");
          }}
        >
          {(["auto", "device", "api"] as TranslateEngine[]).map((id) => (
            <option key={id} value={id}>
              {engineLabel(id)}
            </option>
          ))}
        </select>
      </label>
      <label>
        {tr("Texte à traduire")}
        <textarea
          autoFocus
          maxLength={5000}
          disabled={busy}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setResult("");
          }}
        />
      </label>
      <p className="hint">
        {engine === "api"
          ? tr(
              "L’API traduit le texte et laisse les tags, poids et <lora:…> intacts. Elle utilise l’API de génération configurée dans les réglages.",
            )
          : engine === "device"
            ? tr(
                "ML Kit traduit sur votre appareil. Le premier usage télécharge les modèles de langue par Wi-Fi.",
              )
            : tr(
                "L’appareil d’abord, l’API en secours. Sur ordinateur l’appareil n’existe pas : l’API prend le relais.",
              )}
      </p>
      {engine !== "api" && (
        <label className="translation-cellular">
          <input
            type="checkbox"
            checked={cellular}
            disabled={busy}
            onChange={(e) => setCellular(e.target.checked)}
          />
          {tr("Autoriser le téléchargement sur données mobiles")}
        </label>
      )}
      {busy && (
        <p role="status">{tr("Préparation des langues et traduction…")}</p>
      )}
      {error && <p role="alert">{error}</p>}
      {result && (
        <label>
          {tr("Traduction")}
          {used && (
            <small className="translation-engine-used">
              {tr("via {0}", [engineLabel(used === "api" ? "api" : "device")])}
            </small>
          )}
          <textarea
            aria-label={tr("Traduction")}
            value={result}
            onChange={(e) => setResult(e.target.value)}
          />
        </label>
      )}
      <footer className="dialog-actions">
        <button
          disabled={busy || !text.trim()}
          onClick={() => void translate()}
        >
          {busy ? (
            <LoaderCircle className="spin" size={18} />
          ) : (
            <Languages size={18} />
          )}
          {tr("Traduire")}
        </button>
        <button
          className="primary"
          disabled={!result.trim() || busy}
          onClick={() => onInsert(result)}
        >
          {tr("Insérer dans le prompt")}
        </button>
      </footer>
    </Modal>
  );
}
