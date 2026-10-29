import { useState } from "react";
import { Check, RotateCcw, Save } from "lucide-react";
import { t as tr } from "./i18n";
import {
  FALLBACK_SYSTEM,
  defaultSystem,
  readDefaultSystem,
  renderTemplate,
  saveDefaultSystem,
  saveTemplate,
  type PromptTemplate,
} from "./promptTemplates";

/**
 * Shows the exact instruction that is sent to the API and lets the user rewrite
 * it. With a template selected the instruction belongs to that template; with
 * no template it is the app-wide default. Either way the text is editable and
 * persisted on the device.
 */
export default function InstructionEditor({
  template,
  fields,
  previewUser,
  onMessage,
  onError,
  onSaved,
}: {
  template: PromptTemplate | null;
  fields: Record<string, string>;
  previewUser?: string;
  onMessage: (text: string) => void;
  onError: (text: string) => void;
  onSaved?: (next: PromptTemplate[] | null) => void;
}) {
  const initial = template ? template.systemPrompt : defaultSystem();
  const [instruction, setInstruction] = useState(initial);
  const [body, setBody] = useState(template?.body ?? "");
  const [busy, setBusy] = useState(false);

  const structure = template ? renderTemplate(template, fields) : "";
  const effective = template
    ? [structure, instruction.trim(), "Answer with the final prompt only, no explanation."]
        .filter((part) => part && part.trim())
        .join("\n\n")
    : instruction.trim() || FALLBACK_SYSTEM;

  function save() {
    setBusy(true);
    try {
      if (template) {
        const next = saveTemplate({
          ...template,
          systemPrompt: instruction.trim().slice(0, 40_000),
          body: body.slice(0, 40_000),
          at: template.at,
        });
        onSaved?.(next);
        onMessage(tr("Modèle « {0} » enregistré.", [template.name]));
      } else {
        saveDefaultSystem(instruction);
        onSaved?.(null);
        onMessage(tr("Instruction par défaut enregistrée."));
      }
    } catch (error) {
      onError(String(error));
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setBusy(true);
    try {
      if (template) {
        setInstruction("");
        setBody("");
        const next = saveTemplate({
          ...template,
          systemPrompt: "",
          body: "",
          at: template.at,
        });
        onSaved?.(next);
        onMessage(tr("Modèle « {0} » vidé.", [template.name]));
      } else {
        saveDefaultSystem("");
        setInstruction("");
        onSaved?.(null);
        onMessage(tr("Instruction par défaut rétablie."));
      }
    } catch (error) {
      onError(String(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="instruction-editor">
      <p className="instruction-note">
        {template
          ? tr(
              "Ce texte part vers l’API avec chaque génération. Modifiez-le librement : c’est enregistré sur cet appareil.",
            )
          : tr(
              "Aucun modèle sélectionné : voici l’instruction par défaut, envoyée telle quelle avec chaque génération.",
            )}
      </p>

      <label className="instruction-field">
        <span>{tr("指令 / 系统提示词")}</span>
        <textarea
          rows={6}
          spellCheck={false}
          value={instruction}
          placeholder={FALLBACK_SYSTEM}
          onChange={(event) => setInstruction(event.target.value)}
        />
      </label>

      {template && (
        <label className="instruction-field">
          <span>{tr("模板结构（可用 {{变量}}）")}</span>
          <textarea
            rows={4}
            spellCheck={false}
            value={body}
            placeholder={template.body}
            onChange={(event) => setBody(event.target.value)}
          />
        </label>
      )}

      {template && template.params.length > 0 && (
        <p className="instruction-vars">
          {tr("可用变量：")}
          {template.params.map((param) => (
            <code key={param.key}>{`{{${param.key}}}`}</code>
          ))}
        </p>
      )}

      <div className="instruction-preview">
        <strong>{tr("实际发送内容")}</strong>
        <pre>{`system: ${effective}`}</pre>
        {previewUser !== undefined && <pre>{`user: ${previewUser}`}</pre>}
      </div>

      <div className="instruction-actions">
        <button type="button" className="primary" disabled={busy} onClick={save}>
          <Save size={15} /> {tr("保存")}
        </button>
        <button type="button" disabled={busy} onClick={reset}>
          <RotateCcw size={15} /> {tr("恢复默认")}
        </button>
        {template && (
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setInstruction(readDefaultSystem() || "");
              onMessage(tr("已读取默认指令，保存后生效。"));
            }}
          >
            <Check size={15} /> {tr("填入默认指令")}
          </button>
        )}
      </div>
      <p className="instruction-hint">
        {tr("保存后立刻生效；模板列表会同步刷新。")}
      </p>
    </div>
  );
}
