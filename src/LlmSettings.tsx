import { useEffect, useRef, useState } from "react";
import {
  Check,
  Download,
  LoaderCircle,
  Sparkles,
  Trash2,
  Upload,
} from "lucide-react";
import { t as tr } from "./i18n";
import {
  llmChat,
  llmGet,
  llmModels,
  llmSave,
  looseJson,
  type LlmView,
} from "./llm";
import {
  deleteTemplate,
  importSkill,
  readSkillFiles,
  readTemplates,
  saveTemplate,
  type PromptTemplate,
} from "./promptTemplates";
import "./llm-settings.css";

const PRESETS = [
  { label: "OpenAI", url: "https://api.openai.com/v1", model: "gpt-4o-mini" },
  {
    label: "DeepSeek",
    url: "https://api.deepseek.com/v1",
    model: "deepseek-chat",
  },
  {
    label: "Ollama",
    url: "http://127.0.0.1:11434/v1",
    model: "qwen2.5:7b",
  },
  {
    label: "SiliconFlow",
    url: "https://api.siliconflow.cn/v1",
    model: "Qwen/Qwen2.5-7B-Instruct",
  },
];

export default function LlmSettings({
  onMessage,
  onError,
}: {
  onMessage: (text: string) => void;
  onError: (text: string) => void;
}) {
  const [view, setView] = useState<LlmView | null>(null);
  const [baseUrl, setBaseUrl] = useState("");
  const [model, setModel] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [temperature, setTemperature] = useState(0.7);
  const [busy, setBusy] = useState<"" | "save" | "models" | "test" | "skill">("");
  const [models, setModels] = useState<string[]>([]);
  const [templates, setTemplates] = useState<PromptTemplate[]>(() =>
    readTemplates(),
  );
  const folder = useRef<HTMLInputElement>(null);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    llmGet()
      .then((data) => {
        if (!alive.current) return;
        setView(data);
        setBaseUrl(String(data?.base_url ?? ""));
        setModel(String(data?.model ?? ""));
        setTemperature(data?.temperature ?? 0.7);
      })
      .catch(() => {});
    return () => {
      alive.current = false;
    };
  }, []);

  async function save() {
    setBusy("save");
    try {
      const next = await llmSave({
        base_url: baseUrl.trim(),
        model: model.trim(),
        api_key: apiKey ? apiKey : undefined,
        temperature,
      });
      if (!alive.current) return;
      setView(next);
      setApiKey("");
      onMessage(tr("API de génération enregistrée."));
    } catch (error) {
      if (alive.current) onError(String(error));
    } finally {
      if (alive.current) setBusy("");
    }
  }

  async function list() {
    setBusy("models");
    try {
      const names = await llmModels(baseUrl.trim() || undefined, apiKey || undefined);
      if (!alive.current) return;
      setModels(names);
      if (!model && names.length) setModel(names[0]);
      onMessage(tr("{0} modèles disponibles sur cette API.", [names.length]));
    } catch (error) {
      if (alive.current) onError(String(error));
    } finally {
      if (alive.current) setBusy("");
    }
  }

  async function test() {
    setBusy("test");
    try {
      const reply = await llmChat(
        [
          {
            role: "system",
            content:
              "Answer with JSON only: {\"ok\":true,\"tag\":\"<one danbooru tag>\"}",
          },
          { role: "user", content: "one tag for a white cat" },
        ],
        true,
      );
      const parsed = looseJson(reply.content) as { ok?: boolean; tag?: string };
      onMessage(
        tr("Connexion réussie · {0}", [String(parsed?.tag ?? reply.model)]),
      );
    } catch (error) {
      if (alive.current) onError(String(error));
    } finally {
      if (alive.current) setBusy("");
    }
  }

  async function loadSkill(files: FileList | null) {
    if (!files || !files.length) return;
    setBusy("skill");
    try {
      const parsed = await importSkill(await readSkillFiles(files));
      saveTemplate(parsed);
      if (!alive.current) return;
      setTemplates(readTemplates());
      onMessage(tr("Modèle « {0} » importé.", [parsed.name]));
    } catch (error) {
      if (alive.current) onError(String(error));
    } finally {
      if (alive.current) {
        setBusy("");
        if (folder.current) folder.current.value = "";
      }
    }
  }

  return (
    <section className="llm-settings">
      <p className="llm-lead">
        {tr(
          "L’assistant de prompt envoie votre description à l’API de votre choix, puis renvoie des blocs de tags à valider. La clé reste sur cet appareil.",
        )}
      </p>

      <div className="llm-presets" role="group" aria-label={tr("Fournisseurs")}>
        {PRESETS.map((preset) => (
          <button
            key={preset.label}
            type="button"
            onClick={() => {
              setBaseUrl(preset.url);
              setModel(preset.model);
            }}
          >
            {preset.label}
          </button>
        ))}
      </div>

      <label className="llm-row">
        <span>{tr("Adresse de l’API")}</span>
        <input
          value={baseUrl}
          inputMode="url"
          spellCheck={false}
          autoCapitalize="none"
          placeholder="https://api.deepseek.com/v1"
          onChange={(event) => setBaseUrl(event.target.value)}
        />
      </label>
      <label className="llm-row">
        <span>{tr("Modèle")}</span>
        <input
          value={model}
          list="llm-model-list"
          spellCheck={false}
          autoCapitalize="none"
          placeholder="deepseek-chat"
          onChange={(event) => setModel(event.target.value)}
        />
        <datalist id="llm-model-list">
          {models.map((name) => (
            <option key={name} value={name} />
          ))}
        </datalist>
      </label>
      <label className="llm-row">
        <span>{tr("Clé API")}</span>
        <input
          type="password"
          value={apiKey}
          spellCheck={false}
          autoComplete="off"
          placeholder={
            view?.has_key ? tr("Clé enregistrée · laisser vide") : "sk-…"
          }
          onChange={(event) => setApiKey(event.target.value)}
        />
      </label>
      <label className="llm-row">
        <span>
          {tr("Température")} <em>{temperature.toFixed(1)}</em>
        </span>
        <input
          type="range"
          min={0}
          max={2}
          step={0.1}
          value={temperature}
          onChange={(event) => setTemperature(Number(event.target.value))}
        />
      </label>

      <div className="llm-actions">
        <button
          type="button"
          className="primary"
          disabled={busy !== "" || !baseUrl.trim() || !model.trim()}
          onClick={() => void save()}
        >
          {busy === "save" ? <LoaderCircle className="spin" size={16} /> : <Check size={16} />}
          {tr("Enregistrer")}
        </button>
        <button type="button" disabled={busy !== ""} onClick={() => void list()}>
          {busy === "models" ? <LoaderCircle className="spin" size={16} /> : <Download size={16} />}
          {tr("Lister les modèles")}
        </button>
        <button type="button" disabled={busy !== ""} onClick={() => void test()}>
          {busy === "test" ? <LoaderCircle className="spin" size={16} /> : <Sparkles size={16} />}
          {tr("Tester")}
        </button>
      </div>

      <div className="llm-templates">
        <div className="llm-templates-head">
          <strong>{tr("Modèles de prompt")}</strong>
          <small>{tr("{0} / 100", [templates.length])}</small>
        </div>
        <label className="llm-import">
          <Upload size={16} />
          {tr("Importer un dossier skill")}
          <input
            ref={folder}
            type="file"
            multiple
            {...{ webkitdirectory: "", directory: "" }}
            accept=".md,.csv"
            onChange={(event) => void loadSkill(event.target.files)}
          />
        </label>
        {busy === "skill" && (
          <p className="llm-hint" role="status">
            <LoaderCircle className="spin" size={14} />{" "}
            {tr("Lecture du dossier…")}
          </p>
        )}
        <ul className="llm-template-list">
          {templates.map((item) => (
            <li key={item.id}>
              <span>
                <strong>{item.name}</strong>
                <small>
                  {item.description || tr("Sans description")} ·{" "}
                  {tr("{0} variables", [item.params.length])}
                </small>
              </span>
              <button
                type="button"
                aria-label={tr("Supprimer {0}", [item.name])}
                onClick={() => {
                  deleteTemplate(item.id);
                  setTemplates(readTemplates());
                }}
              >
                <Trash2 size={15} />
              </button>
            </li>
          ))}
        </ul>
        {templates.length === 0 && (
          <p className="llm-hint">
            {tr(
              "Importez un dossier contenant SKILL.md pour créer un modèle réutilisable.",
            )}
          </p>
        )}
      </div>
    </section>
  );
}
