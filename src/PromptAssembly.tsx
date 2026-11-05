import { useMemo, useState } from "react";
import {
  Bookmark,
  Check,
  ChevronDown,
  Plus,
  Save,
  Trash2,
  Wand2,
} from "lucide-react";
import { t as tr } from "./i18n";
import CollapsibleCard from "./CollapsibleCard";
import {
  applyRules,
  assemble,
  emptyAssembly,
  type Assembly,
} from "./promptRules";
import {
  deleteFixPreset,
  deleteProfile,
  deleteRulePreset,
  readFixPresets,
  readProfiles,
  readRulePresets,
  saveFixPreset,
  saveProfile,
  saveRulePreset,
  type ProfilePayload,
} from "./promptPresets";
import type { Settings } from "./workflow";
import "./prompt-assembly.css";

const QUALITY_POSITIVE =
  "best quality, amazing quality, very aesthetic, absurdres";

export default function PromptAssembly({
  assembly,
  onAssembly,
  rulesText,
  onRules,
  settings,
  workflowName,
  onApplyProfile,
  onMessage,
  onError,
}: {
  assembly: Assembly;
  onAssembly: (next: Assembly) => void;
  rulesText: string;
  onRules: (next: string) => void;
  settings: Settings;
  workflowName: string;
  onApplyProfile: (payload: ProfilePayload) => void;
  onMessage: (text: string) => void;
  onError: (text: string) => void;
}) {
  const [fixes, setFixes] = useState(() => safe(readFixPresets));
  const [ruleSets, setRuleSets] = useState(() => safe(readRulePresets));
  const [profiles, setProfiles] = useState(() => safe(readProfiles));
  const [fixId, setFixId] = useState("");
  const [rulesId, setRulesId] = useState("");
  const [profileId, setProfileId] = useState("");
  const [name, setName] = useState("");
  const [rulesOpen, setRulesOpen] = useState(false);

  // Live preview: how many rules fire against what the user typed.
  const preview = useMemo(
    () => applyRules(settings.positive, rulesText),
    [settings.positive, rulesText],
  );
  const composed = useMemo(
    () => assemble(preview, assembly),
    [preview, assembly],
  );

  const guard = (fn: () => void) => {
    try {
      fn();
    } catch (e) {
      onError(String(e));
    }
  };

  const update = (patch: Partial<Assembly>) =>
    onAssembly({ ...assembly, ...patch });

  const saveFix = () =>
    guard(() => {
      const entry = saveFixPreset(name || tr("Blocs fixes"), assembly);
      setFixes(readFixPresets());
      setFixId(entry.id);
      setName("");
      onMessage(tr("Blocs fixes enregistrés."));
    });

  const saveRules = () =>
    guard(() => {
      const entry = saveRulePreset(name || tr("Règles"), rulesText);
      setRuleSets(readRulePresets());
      setRulesId(entry.id);
      setName("");
      onMessage(tr("Règles enregistrées."));
    });

  const saveWholeProfile = () =>
    guard(() => {
      const payload: ProfilePayload = {
        assembly,
        rulesText,
        settings,
        workflowName,
        fixId,
        rulesId,
      };
      const entry = saveProfile(name || tr("Réglage"), payload, profileId || undefined);
      setProfiles(readProfiles());
      setProfileId(entry.id);
      setName("");
      onMessage(tr("配置档案已保存。"));
    });

  return (
    <CollapsibleCard className="assembly-slot" title={tr("提示词装配")}>
      <p className="muted">
        {tr(
          "把固定块、质量标签和替换规则拼在提示词外面。工作流里的 {{prompt}} 会收到拼好的结果。",
        )}
      </p>

      <div className="assembly-grid">
        <label className="assembly-field">
          <span>{tr("前置固定")}</span>
          <textarea
            rows={3}
            value={assembly.before}
            placeholder={tr("写在你的提示词前面")}
            onChange={(e) => update({ before: e.target.value })}
          />
        </label>
        <label className="assembly-field">
          <span>{tr("后置固定")}</span>
          <textarea
            rows={3}
            value={assembly.after}
            placeholder={tr("写在你的提示词后面")}
            onChange={(e) => update({ after: e.target.value })}
          />
        </label>
        <label className="assembly-field">
          <span>{tr("质量标签（正面）")}</span>
          <textarea
            rows={2}
            value={assembly.quality}
            placeholder={QUALITY_POSITIVE}
            onChange={(e) => update({ quality: e.target.value })}
          />
          <button
            type="button"
            className="assembly-hint"
            onClick={() => update({ quality: QUALITY_POSITIVE })}
          >
            <Wand2 size={13} /> {tr("填入推荐值")}
          </button>
        </label>
        <label className="assembly-field">
          <span>{tr("质量标签（负面）")}</span>
          <textarea
            rows={2}
            value={assembly.qualityNegative}
            placeholder={tr("放在负面提示词最前")}
            onChange={(e) => update({ qualityNegative: e.target.value })}
          />
        </label>
      </div>

      <div className="assembly-bar">
        <label className="assembly-picker">
          <Bookmark size={15} />
          <select
            aria-label={tr("固定块预设")}
            value={fixId}
            onChange={(e) => {
              const id = e.target.value;
              setFixId(id);
              const hit = fixes.find((item) => item.id === id);
              if (hit) {
                onAssembly(hit.assembly);
                onMessage(tr("已载入「{0}」。", [hit.name]));
              }
            }}
          >
            <option value="">{tr("固定块预设")}</option>
            {fixes.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        <input
          className="assembly-name"
          maxLength={120}
          value={name}
          aria-label={tr("名称")}
          placeholder={tr("名称")}
          onChange={(e) => setName(e.target.value)}
        />
        <button type="button" onClick={saveFix}>
          <Save size={15} /> {tr("保存")}
        </button>
        {fixId && (
          <button
            type="button"
            aria-label={tr("删除固定块预设")}
            onClick={() =>
              guard(() => {
                deleteFixPreset(fixId);
                setFixes(readFixPresets());
                setFixId("");
              })
            }
          >
            <Trash2 size={15} />
          </button>
        )}
        <button
          type="button"
          onClick={() => onAssembly({ ...emptyAssembly })}
          aria-label={tr("清空装配")}
        >
          {tr("清空")}
        </button>
      </div>

      <button
        type="button"
        className="assembly-toggle"
        aria-expanded={rulesOpen}
        onClick={() => setRulesOpen((v) => !v)}
      >
        <ChevronDown size={16} /> {tr("替换规则")}
        <small>
          {tr("命中 {0} 条", [preview.applied])}
        </small>
      </button>

      {rulesOpen && (
        <>
          <p className="muted">
            {tr(
              "每行一条：触发词 | 类型 | 内容。类型可以是 替换 / 前置前 / 前置后 / 后置前 / 后置后 / 最后置。触发词用 | 分隔，/正则/ 可用。",
            )}
          </p>
          <textarea
            className="assembly-rules"
            rows={8}
            spellCheck={false}
            value={rulesText}
            aria-label={tr("替换规则")}
            placeholder={"1girl | 前置前 | solo\nhat | 替换 | beret"}
            onChange={(e) => onRules(e.target.value)}
          />
          <div className="assembly-bar">
            <label className="assembly-picker">
              <Bookmark size={15} />
              <select
                aria-label={tr("规则预设")}
                value={rulesId}
                onChange={(e) => {
                  const id = e.target.value;
                  setRulesId(id);
                  const hit = ruleSets.find((item) => item.id === id);
                  if (hit) {
                    onRules(hit.text);
                    onMessage(tr("已载入「{0}」。", [hit.name]));
                  }
                }}
              >
                <option value="">{tr("规则预设")}</option>
                {ruleSets.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
            <button type="button" onClick={saveRules}>
              <Save size={15} /> {tr("保存规则")}
            </button>
            {rulesId && (
              <button
                type="button"
                aria-label={tr("删除规则预设")}
                onClick={() =>
                  guard(() => {
                    deleteRulePreset(rulesId);
                    setRuleSets(readRulePresets());
                    setRulesId("");
                  })
                }
              >
                <Trash2 size={15} />
              </button>
            )}
          </div>
          {preview.modifiedPrompt !== settings.positive && (
            <div className="assembly-preview">
              <span>{tr("替换后")}</span>
              <code>{preview.modifiedPrompt || tr("—")}</code>
            </div>
          )}
        </>
      )}

      <div className="assembly-final">
        <span>{tr("实际发送的正面提示词")}</span>
        <code>{composed || tr("—")}</code>
      </div>

      <div className="assembly-bar">
        <label className="assembly-picker">
          <Bookmark size={15} />
          <select
            aria-label={tr("配置档案")}
            value={profileId}
            onChange={(e) => {
              const id = e.target.value;
              setProfileId(id);
              const hit = profiles.find((item) => item.id === id);
              if (hit) {
                onApplyProfile(hit.payload);
                onMessage(tr("已套用「{0}」。", [hit.name]));
              }
            }}
          >
            <option value="">{tr("配置档案")}</option>
            {profiles.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        <button type="button" className="primary" onClick={saveWholeProfile}>
          <Plus size={15} /> {tr("保存整套配置")}
        </button>
        {profileId && (
          <button
            type="button"
            aria-label={tr("删除配置档案")}
            onClick={() =>
              guard(() => {
                deleteProfile(profileId);
                setProfiles(readProfiles());
                setProfileId("");
              })
            }
          >
            <Trash2 size={15} />
          </button>
        )}
        {profileId && (
          <span className="assembly-saved" aria-hidden>
            <Check size={14} />
          </span>
        )}
      </div>
    </CollapsibleCard>
  );
}

function safe<T>(load: () => T[]): T[] {
  try {
    return load();
  } catch {
    return [];
  }
}
