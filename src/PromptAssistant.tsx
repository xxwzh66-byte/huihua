import { useEffect, useMemo, useRef, useState } from "react";
import { Check, LoaderCircle, Sparkles, Square } from "lucide-react";
import { Modal } from "./Modal";
import { t, locale } from "./i18n";
import type { Prompts } from "./promptLibrary";
import {
  applyProposals,
  validateProposals,
  type PromptOptimizer,
  type PromptProposal,
} from "./promptOptimizer";
import { createAdapter } from "./llmAdapter";
import { llmGet, llmReady, type LlmView } from "./llm";
import {
  readTemplates,
  renderTemplate,
  type PromptTemplate,
} from "./promptTemplates";
import mochi from "../assets/brand/expressions/open.webp";
const DRAFT = "mochi-voice-draft-v1";
function readDraft() {
  try {
    const value = JSON.parse(localStorage.getItem(DRAFT) || "{}");
    return {
      description:
        typeof value.description === "string"
          ? value.description.slice(0, 5000)
          : "",
      language:
        value.language === "en"
          ? ("en" as const)
          : value.language === "fr"
            ? ("fr" as const)
            : locale() === "fr"
              ? ("fr" as const)
              : ("en" as const),
    };
  } catch {
    return {
      description: "",
      language: locale() === "fr" ? ("fr" as const) : ("en" as const),
    };
  }
}
export default function PromptAssistant({
  side,
  values,
  onChange,
  onClose,
  adapter,
}: {
  side: keyof Prompts;
  values: Prompts;
  onChange: (v: Prompts) => void;
  onClose: () => void;
  adapter?: PromptOptimizer;
}) {
  const [draft, setDraft] = useState(readDraft);
  const [phase, setPhase] = useState<"idle" | "optimizing" | "review">("idle");
  const [error, setError] = useState("");
  const [storageError, setStorageError] = useState(false);
  const [proposals, setProposals] = useState<
    (PromptProposal & { selected: boolean })[]
  >([]);
  const [config, setConfig] = useState<LlmView | null>(null);
  const [templates] = useState<PromptTemplate[]>(() => readTemplates());
  const [templateId, setTemplateId] = useState("");
  const [fields, setFields] = useState<Record<string, string>>({});
  const request = useRef<AbortController | null>(null);
  const busy = phase === "optimizing";
  const template = templates.find((item) => item.id === templateId) ?? null;
  const engine = useMemo(
    () => adapter ?? createAdapter({ templateId, modelName: config?.model || "API" }),
    [adapter, templateId, config?.model],
  );
  const ready = Boolean(adapter) || llmReady(config);
  useEffect(() => {
    let live = true;
    llmGet()
      .then((view) => {
        if (live) setConfig(view);
      })
      .catch(() => {
        if (live) setConfig(null);
      });
    return () => {
      live = false;
    };
  }, []);
  useEffect(() => () => request.current?.abort(), []);
  function save(next: typeof draft) {
    setDraft(next);
    try {
      localStorage.setItem(DRAFT, JSON.stringify(next));
      setStorageError(false);
    } catch {
      setStorageError(true);
    }
  }
  function cancel() {
    request.current?.abort();
    request.current = null;
    setPhase("idle");
  }
  async function run() {
    if (request.current || busy || !ready) return;
    const controller = new AbortController();
    request.current = controller;
    setError("");
    setPhase("optimizing");
    try {
      const composed = template
        ? [renderTemplate(template, fields), draft.description]
            .filter((part) => part.trim())
            .join(". ")
        : draft.description;
      const result = validateProposals(
        await engine.optimize(
          { ...draft, description: composed, side },
          controller.signal,
        ),
      );
      if (controller.signal.aborted) return;
      setProposals(result.map((p) => ({ ...p, selected: true })));
      setPhase("review");
    } catch (error) {
      if (!controller.signal.aborted) {
        setError(
          t(
            "Impossible de préparer les tags. Votre description est conservée ; réessayez.",
          ) + (error instanceof Error ? ` ${error.message}` : ""),
        );
        setPhase("idle");
      }
    } finally {
      if (request.current === controller) request.current = null;
    }
  }
  return (
    <Modal
      title={t("Assistant de prompt")}
      className="prompt-assistant"
      onClose={() => {
        cancel();
        onClose();
      }}
    >
      <div className="assistant-intro">
        <img src={mochi} alt="" />
        <div>
          <h3>{ready ? engine.name : t("De votre idée aux tags")}</h3>
          <p>
            {t(
              "Décrivez votre scène, puis choisissez les blocs à ajouter au prompt.",
            )}
          </p>
        </div>
      </div>
      {templates.length > 0 && (
        <label>
          {t("Modèle de prompt")}
          <select
            disabled={busy}
            value={templateId}
            onChange={(e) => {
              setTemplateId(e.target.value);
              setFields({});
            }}
          >
            <option value="">{t("Aucun modèle")}</option>
            {templates.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
      )}
      {template && template.params.length > 0 && (
        <div className="assistant-params">
          {template.params.map((param) => (
            <label key={param.key}>
              {param.label}
              {param.kind === "select" ? (
                <select
                  disabled={busy}
                  value={fields[param.key] ?? ""}
                  onChange={(e) =>
                    setFields({ ...fields, [param.key]: e.target.value })
                  }
                >
                  <option value="">—</option>
                  {(param.options ?? []).map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  disabled={busy}
                  maxLength={200}
                  value={fields[param.key] ?? ""}
                  onChange={(e) =>
                    setFields({ ...fields, [param.key]: e.target.value })
                  }
                />
              )}
            </label>
          ))}
        </div>
      )}
      <label>
        {t("Langue de la description")}
        <select
          disabled={busy}
          value={draft.language}
          onChange={(e) =>
            save({ ...draft, language: e.target.value as "fr" | "en" })
          }
        >
          <option value="fr">Français</option>
          <option value="en">English</option>
        </select>
      </label>
      <label>
        {t("Décrivez votre idée")}
        <textarea
          disabled={busy}
          maxLength={5000}
          value={draft.description}
          placeholder={t(
            "Une fille avec une robe rouge, des yeux bleus et des cheveux blancs coupés au carré…",
          )}
          onChange={(e) => save({ ...draft, description: e.target.value })}
        />
      </label>
      <div className="assistant-draft-status">
        <span>
          {storageError
            ? t("Brouillon conservé pour cette session uniquement.")
            : t("Brouillon enregistré sur cet appareil.")}
        </span>
        <span>{draft.description.length}/5 000</span>
      </div>
      {!ready && (
        <p className="assistant-hint" role="status">
          {t(
            "Configurez une API de génération dans les paramètres pour activer cet assistant.",
          )}
        </p>
      )}
      <div className="assistant-actions">
        <button
          className="primary"
          disabled={!ready || busy || !draft.description.trim()}
          onClick={() => void run()}
        >
          <Sparkles size={18} />
          {t("Proposer des tags")}
        </button>
      </div>
      {busy && (
        <div className="assistant-progress" role="status">
          <LoaderCircle className="spin" size={20} />
          <span>{t("Préparation des blocs…")}</span>
          <button onClick={cancel}>
            <Square size={15} />
            {t("Annuler")}
          </button>
        </div>
      )}
      {error && <p role="alert">{error}</p>}
      {phase === "review" && (
        <section className="assistant-review">
          <h3>{t("Vérifier avant d’insérer")}</h3>
          <p>
            {t(
              "Modifiez les tags et décochez les blocs à ignorer. Votre prompt existant sera conservé.",
            )}
          </p>
          {proposals.map((p, i) => (
            <article key={i}>
              <label className="proposal-check">
                <input
                  type="checkbox"
                  checked={p.selected}
                  onChange={(e) =>
                    setProposals(
                      proposals.map((v, n) =>
                        n === i ? { ...v, selected: e.target.checked } : v,
                      ),
                    )
                  }
                />
                {t("Inclure le bloc {0}", [i + 1])}
              </label>
              <label>
                {t("Titre du bloc")}
                <input
                  maxLength={80}
                  value={p.title}
                  onChange={(e) =>
                    setProposals(
                      proposals.map((v, n) =>
                        n === i ? { ...v, title: e.target.value } : v,
                      ),
                    )
                  }
                />
              </label>
              <label>
                {t("Destination")}
                <select
                  value={p.side}
                  onChange={(e) =>
                    setProposals(
                      proposals.map((v, n) =>
                        n === i
                          ? { ...v, side: e.target.value as keyof Prompts }
                          : v,
                      ),
                    )
                  }
                >
                  <option value="positive">{t("Positif")}</option>
                  <option value="negative">{t("Négatif")}</option>
                </select>
              </label>
              <label>
                {t("Tags proposés")}
                <textarea
                  maxLength={20000}
                  value={p.text}
                  onChange={(e) =>
                    setProposals(
                      proposals.map((v, n) =>
                        n === i ? { ...v, text: e.target.value } : v,
                      ),
                    )
                  }
                />
              </label>
            </article>
          ))}
          <button
            className="primary"
            disabled={!proposals.some((p) => p.selected && p.text.trim())}
            onClick={() => {
              onChange(
                applyProposals(
                  values,
                  proposals.filter((p) => p.selected && p.text.trim()),
                ),
              );
              onClose();
            }}
          >
            <Check size={18} />
            {t("Insérer les blocs sélectionnés")}
          </button>
        </section>
      )}
    </Modal>
  );
}
