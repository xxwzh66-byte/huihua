import { useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  Copy,
  Eraser,
  FileCode2,
  LoaderCircle,
  Settings2,
  Sparkles,
  Square,
  Trash2,
  Wand2,
} from "lucide-react";
import { t, locale } from "./i18n";
import { llmChat, llmGet, llmReady, type LlmView } from "./llm";
import {
  defaultSystem,
  readTemplates,
  renderTemplate,
  type PromptTemplate,
} from "./promptTemplates";
import InstructionEditor from "./InstructionEditor";
import "./prompt-studio.css";

const HISTORY = "prompt-studio-history-v1";
const LIMIT = 30;
const MAX_INPUT = 4000;

type Entry = { id: string; input: string; output: string; at: number };

function valid(entry: unknown): entry is Entry {
  if (!entry || typeof entry !== "object") return false;
  const item = entry as Record<string, unknown>;
  return (
    typeof item.id === "string" &&
    typeof item.input === "string" &&
    typeof item.output === "string" &&
    typeof item.at === "number"
  );
}

function readHistory(): Entry[] {
  try {
    const value = JSON.parse(localStorage.getItem(HISTORY) || "[]");
    return Array.isArray(value) ? value.filter(valid).slice(0, LIMIT) : [];
  } catch {
    return [];
  }
}

function writeHistory(entries: Entry[]) {
  try {
    localStorage.setItem(HISTORY, JSON.stringify(entries.slice(0, LIMIT)));
  } catch {
    /* a full quota only costs the local history */
  }
}

/**
 * Standalone prompt page: one box in, one prompt out, with a copy button and a
 * direct insert into the Atelier prompts. Separate from `PromptAssistant`
 * because the block-review flow only makes sense while editing a prompt.
 */
export default function PromptStudio({
  onInsert,
  onOpenSettings,
  draft,
}: {
  onInsert: (text: string, side: "positive" | "negative") => void;
  onOpenSettings: () => void;
  draft?: { text: string; id: number } | null;
}) {
  const [input, setInput] = useState("");
  const [output, setOutput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [copied, setCopied] = useState("");
  const [config, setConfig] = useState<LlmView | null>(null);
  const [templates, setTemplates] = useState<PromptTemplate[]>(() =>
    readTemplates(),
  );
  const [templateId, setTemplateId] = useState("");
  const [fields, setFields] = useState<Record<string, string>>({});
  const [history, setHistory] = useState<Entry[]>(readHistory);
  const [showInstruction, setShowInstruction] = useState(false);
  const [instructionVersion, setInstructionVersion] = useState(0);
  const request = useRef<AbortController | null>(null);

  useEffect(() => {
    let alive = true;
    void llmGet()
      .then((data) => {
        if (alive)
          setConfig({
            base_url: String(data?.base_url ?? ""),
            model: String(data?.model ?? ""),
            temperature: data?.temperature ?? 0.7,
            has_key: Boolean(data?.has_key),
          });
      })
      .catch(() => {
        if (alive)
          setConfig({
            base_url: "",
            model: "",
            temperature: 0.7,
            has_key: false,
          });
      });
    return () => {
      alive = false;
    };
  }, []);

  // v1.16: the wardrobe can hand its selection to this box as a scene draft.
  useEffect(() => {
    if (!draft || !draft.text) return;
    setInput(draft.text);
    setOutput("");
    setNotice(t("素材已作为画面描述填入。"));
  }, [draft]);

  const template = templates.find((item) => item.id === templateId) ?? null;
  const ready = llmReady(config);
  const trimmed = input.trim();

  const system = useMemo(
    () =>
      template
        ? [
            renderTemplate(template, fields),
            template.systemPrompt.trim(),
            "Answer with the final prompt only, no explanation.",
          ]
            .filter((part) => part && part.trim())
            .join("\n\n")
        : defaultSystem(),
    // instructionVersion forces a recompute after the editor saves.
    [template, fields, instructionVersion],
  );

  const userMessage = `${template ? "Scene: " : ""}${trimmed} (${
    locale() === "zh-CN" ? "chinese" : locale()
  } description)`;

  async function generate() {
    if (!trimmed || busy || !ready) return;
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    setError("");
    try {
      const reply = await llmChat(
        [
          { role: "system", content: system },
          {
            role: "user",
            content: userMessage,
          },
        ],
        false,
      );
      if (controller.signal.aborted) return;
      const text = reply.content.trim().slice(0, 8000);
      setOutput(text);
      setCopied("");
      const entry: Entry = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        input: trimmed.slice(0, MAX_INPUT),
        output: text,
        at: Date.now(),
      };
      const next = [entry, ...history].slice(0, LIMIT);
      setHistory(next);
      writeHistory(next);
    } catch (caught) {
      if (!controller.signal.aborted)
        setError(
          t("La génération a échoué. Votre saisie est conservée.") +
            (caught instanceof Error ? ` ${caught.message}` : ""),
        );
    } finally {
      if (request.current === controller) request.current = null;
      setBusy(false);
    }
  }

  function cancel() {
    request.current?.abort();
    request.current = null;
    setBusy(false);
  }

  async function copy(text: string, tag: string) {
    if (!text) return;
    const legacy = () => {
      const area = document.createElement("textarea");
      area.value = text;
      area.setAttribute("readonly", "");
      area.style.position = "fixed";
      area.style.top = "-1000px";
      document.body.appendChild(area);
      area.select();
      area.setSelectionRange(0, text.length);
      const ok = document.execCommand("copy");
      area.remove();
      if (!ok) throw new Error("copy");
    };
    try {
      if (navigator.clipboard?.writeText) {
        try {
          await navigator.clipboard.writeText(text);
        } catch {
          legacy();
        }
      } else legacy();
      setCopied(tag);
      window.setTimeout(() => setCopied(""), 1800);
    } catch {
      setError(t("La copie automatique est indisponible sur cet appareil."));
    }
  }

  function drop(id: string) {
    const next = history.filter((entry) => entry.id !== id);
    setHistory(next);
    writeHistory(next);
  }

  return (

    <div className="prompt-studio">
      <section className="studio-block">
        <div className="studio-block-head">
          <h2>
            <Wand2 size={17} /> {t("描述你想画的画面")}
          </h2>
          {!ready && (
            <button className="studio-link" onClick={onOpenSettings}>
              <Settings2 size={15} /> {t("配置生成 API")}
            </button>
          )}
        </div>
        {ready ? (
          <p className="studio-hint">
            {t("用一句话描述，例如「雨夜的东京街头，粉色霓虹，湿漉漉的柏油路」。")}
          </p>
        ) : (
          <p className="studio-hint warning">
            {t("先在设置里填写生成 API 的地址与模型，这个页面才会工作。")}
          </p>
        )}
        {templates.length > 0 && (
          <label className="studio-field">
            <span>{t("提示词模板")}</span>
            <select
              value={templateId}
              onChange={(e) => {
                setTemplateId(e.target.value);
                setFields({});
                setShowInstruction(false);
              }}
            >
              <option value="">{t("不使用模板")}</option>
              {templates.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <button
          type="button"
          className="studio-instruction-toggle"
          aria-expanded={showInstruction}
          onClick={() => setShowInstruction((v) => !v)}
        >
          <FileCode2 size={15} />
          {showInstruction ? t("收起注入模板") : t("查看 / 修改注入模板")}
        </button>
        {showInstruction && (
          <InstructionEditor
            key={`${templateId}:${instructionVersion}`}
            template={template}
            fields={fields}
            previewUser={trimmed ? userMessage : undefined}
            onMessage={setNotice}
            onError={setError}
            onSaved={(next) => {
              if (next) setTemplates(next);
              setInstructionVersion((v) => v + 1);
            }}
          />
        )}
        {template && template.params.length > 0 && (
          <div className="studio-params">
            {template.params.map((param) => (
              <label className="studio-field" key={param.key}>
                <span>{param.label}</span>
                {param.kind === "select" ? (
                  <select
                    value={fields[param.key] ?? ""}
                    onChange={(e) =>
                      setFields((f) => ({ ...f, [param.key]: e.target.value }))
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
                    value={fields[param.key] ?? ""}
                    onChange={(e) =>
                      setFields((f) => ({ ...f, [param.key]: e.target.value }))
                    }
                  />
                )}
              </label>
            ))}
          </div>
        )}
        <label className="studio-field">
          <span>{t("画面描述")}</span>
          <textarea
            rows={5}
            maxLength={MAX_INPUT}
            value={input}
            disabled={busy}
            placeholder={t(
              "雨夜的东京街头，粉色霓虹，湿漉漉的柏油路上有倒影…",
            )}
            onChange={(e) => setInput(e.target.value)}
          />
        </label>
        <div className="studio-meta">
          <span>
            {input.length} / {MAX_INPUT}
          </span>
          {input && (
            <button className="studio-link" onClick={() => setInput("")}>
              <Eraser size={14} /> {t("清空")}
            </button>
          )}
        </div>
        <div className="studio-actions">
          {busy ? (
            <button className="primary" onClick={cancel}>
              <Square size={16} /> {t("停止生成")}
            </button>
          ) : (
            <button
              className="primary"
              disabled={!ready || !trimmed}
              onClick={() => void generate()}
            >
              <Sparkles size={17} /> {t("生成提示词")}
            </button>
          )}
          {config?.model && <small className="studio-model">{config.model}</small>}
        </div>
        {busy && (
          <div className="studio-progress" role="status">
            <LoaderCircle className="spin" size={18} />
            <span>{t("正在生成…")}</span>
          </div>
        )}
        {error && (
          <p className="studio-error" role="alert">
            {error}
          </p>
        )}
        {notice && (
          <p className="studio-notice" role="status">
            {notice}
          </p>
        )}
      </section>
      {output && (
        <section className="studio-block">
          <div className="studio-block-head">
            <h2>
              <Sparkles size={17} /> {t("生成的提示词")}
            </h2>
            <button
              className="studio-link"
              onClick={() => void copy(output, "output")}
            >
              {copied === "output" ? <Check size={14} /> : <Copy size={14} />}
              {copied === "output" ? t("已复制") : t("复制")}
            </button>
          </div>
          <pre className="studio-output">{output}</pre>
          <div className="studio-actions">
            <button onClick={() => onInsert(output, "positive")}>
              {t("填入工坊正向提示词")}
            </button>
            <button onClick={() => onInsert(output, "negative")}>
              {t("填入负向提示词")}
            </button>
          </div>
        </section>
      )}
      {history.length > 0 && (
        <section className="studio-block">
          <div className="studio-block-head">
            <h2>{t("最近生成")}</h2>
            <button
              className="studio-link"
              onClick={() => {
                setHistory([]);
                writeHistory([]);
              }}
            >
              <Trash2 size={14} /> {t("清空记录")}
            </button>
          </div>
          <ul className="studio-history">
            {history.map((entry) => (
              <li key={entry.id}>
                <button
                  className="studio-history-body"
                  onClick={() => {
                    setInput(entry.input);
                    setOutput(entry.output);
                    setCopied("");
                  }}
                >
                  <span>{entry.input.slice(0, 70)}</span>
                  <small>
                    {new Date(entry.at).toLocaleString(locale(), {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </small>
                </button>
                <button
                  className="studio-history-copy"
                  aria-label={t("复制")}
                  onClick={() => void copy(entry.output, entry.id)}
                >
                  {copied === entry.id ? (
                    <Check size={14} />
                  ) : (
                    <Copy size={14} />
                  )}
                </button>
                <button
                  className="studio-history-copy"
                  aria-label={t("删除这条记录")}
                  onClick={() => drop(entry.id)}
                >
                  <Trash2 size={14} />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
