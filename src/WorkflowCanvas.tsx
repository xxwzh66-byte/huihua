import { useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Link2,
  Pencil,
  Unlink,
} from "lucide-react";
import { t as tr } from "./i18n";
import { Modal } from "./Modal";
import PromptEditor from "./PromptEditor";
import { type ObjectInfo, type Workflow } from "./api";
import {
  coerceField,
  isPromptField,
  nodeFields,
  nodeTitle,
  setField,
  type Field,
} from "./workflowGraph";
import {
  BINDINGS,
  applyBinding,
  bindingKeyOf,
  bindingOf,
  bindingValue,
  fieldPreview,
  resolvedText,
  token,
  usedBindings,
} from "./workflowBindings";
import type { Settings } from "./workflow";
import "./workflow-canvas.css";

type Props = {
  graph: Workflow;
  info: ObjectInfo;
  settings: Settings;
  onChange: (next: Workflow) => void;
  onSettings: (next: Settings) => void;
  onMessage: (text: string) => void;
};

const ACCENTS: Record<string, string> = {
  CheckpointLoaderSimple: "loader",
  UNETLoader: "loader",
  VAELoader: "loader",
  CLIPLoader: "loader",
  DualCLIPLoader: "loader",
  LoraLoader: "loader",
  CLIPTextEncode: "prompt",
  CLIPTextEncodeFlux: "prompt",
  KSampler: "sample",
  KSamplerAdvanced: "sample",
  EmptyLatentImage: "latent",
  LatentUpscale: "latent",
  VAEDecode: "latent",
  VAEEncode: "latent",
  ImageScale: "latent",
  ImageScaleBy: "latent",
  SaveImage: "output",
  PreviewImage: "output",
  PreviewImageFormat: "output",
};

const accentOf = (classType: string) => ACCENTS[classType] ?? "other";

/** Output nodes whose image is the live preview of the Atelier. */
export function isPreviewNode(classType: string) {
  return /previewimage|saveimage/i.test(classType);
}

/**
 * ComfyUI API graphs are wide DAGs that never fit a phone. The default view is
 * therefore a vertical flow: one full-width card per node, ordered by dependency
 * depth, with every connection rendered as a "← #id" chip instead of a curve.
 */
export default function WorkflowCanvas({
  graph,
  info,
  settings,
  onChange,
  onSettings,
  onMessage,
}: Props) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [editing, setEditing] = useState<{ id: string; field: string } | null>(
    null,
  );
  const [binding, setBinding] = useState<{ id: string; field: string } | null>(
    null,
  );

  const order = useMemo(() => flowOrder(graph), [graph]);
  const plan = useMemo(
    () =>
      new Map(
        Object.keys(graph).map((id) => [id, nodeFields(graph, info, id)]),
      ),
    [graph, info],
  );
  const bound = useMemo(() => usedBindings(graph), [graph]);

  const editingNode = editing ? graph[editing.id] : null;
  const editingField = editing
    ? (plan.get(editing.id) ?? []).find((f) => f.name === editing.field)
    : null;
  const bindingNode = binding ? graph[binding.id] : null;
  const bindingField = binding
    ? (plan.get(binding.id) ?? []).find((f) => f.name === binding.field)
    : null;

  return (
    <div className="workflow-canvas">
      <div className="canvas-toolbar">
        <span className="canvas-count">
          {tr("{0} 个节点", [Object.keys(graph).length])}
          {bound.length > 0 && (
            <>
              {" · "}
              {tr("{0} 个占位符", [bound.length])}
            </>
          )}
        </span>
        <div className="canvas-bindings">
          {bound.map((key) => {
            const item = bindingOf(key);
            return (
              <span
                key={key}
                className="binding-chip active"
                title={`{{${key}}}`}
              >
                {item?.label ?? key}
              </span>
            );
          })}
        </div>
      </div>
      <div className="canvas-flow">
        {order.map((id, index) => {
          const data = graph[id];
          if (!data) return null;
          const hidden = Boolean(collapsed[id]);
          const fields = plan.get(id) ?? [];
          return (
            <article
              key={id}
              className={`flow-card ${accentOf(data.class_type)}`}
            >
              <button
                type="button"
                className="flow-head"
                aria-expanded={!hidden}
                onClick={() => setCollapsed({ ...collapsed, [id]: !hidden })}
              >
                <span className="node-index">{index + 1}</span>
                <span className="flow-name">
                  <strong>{nodeTitle(graph, id)}</strong>
                  <small>#{id} · {data.class_type}</small>
                </span>
                {hidden ? (
                  <ChevronRight size={16} />
                ) : (
                  <ChevronDown size={16} />
                )}
              </button>
              {!hidden && (
                <div className="node-fields">
                  {fields.map((field) => (
                    <NodeField
                      key={field.name}
                      field={field}
                      classType={data.class_type}
                      graph={graph}
                      settings={settings}
                      onSettings={onSettings}
                      onEdit={(value) =>
                        onChange(setField(graph, id, field.name, value))
                      }
                      onOpenPrompt={() =>
                        setEditing({ id, field: field.name })
                      }
                      onBind={() =>
                        setBinding({ id, field: field.name })
                      }
                    />
                  ))}
                  {fields.length === 0 && (
                    <p className="node-empty">{tr("没有输入项。")}</p>
                  )}
                </div>
              )}
            </article>
          );
        })}
        {order.length === 0 && (
          <p className="canvas-empty">{tr("这个工作流没有节点。")}</p>
        )}
      </div>
      {editing && editingField && editingNode && (
        <Modal
          title={tr("编辑 {0}", [editingField.name])}
          className="canvas-prompt-dialog"
          onClose={() => setEditing(null)}
        >
          <p className="muted">
            #{editing.id} · {editingNode.class_type}
          </p>
          <PromptEditor
            initialTab="positive"
            values={{
              positive:
                typeof editingField.value === "string" ? editingField.value : "",
              negative: "",
            }}
            onChange={(next) =>
              onChange(setField(graph, editing.id, editing.field, next.positive))
            }
            onClose={() => {
              setEditing(null);
              onMessage(tr("提示词已写入工作流。"));
            }}
          />
        </Modal>
      )}
      {binding && bindingField && bindingNode && (
        <Modal
          title={tr("占位符 · {0}", [bindingField.name])}
          className="binding-dialog"
          onClose={() => setBinding(null)}
        >
          <p className="muted">
            #{binding.id} · {bindingNode.class_type}
          </p>
          <p className="binding-hint">
            {tr(
              "把这个参数交给自动模式：每次生成都会用自动设置里的值替换占位符。",
            )}
          </p>
          <div className="binding-list">
            {BINDINGS.filter((item) =>
              bindingField.kind === "number"
                ? item.kind === "number"
                : item.kind !== "number",
            ).map((item) => {
              const active =
                typeof bindingField.value === "string" &&
                bindingKeyOf(bindingField.value) === item.key;
              return (
                <button
                  key={item.key}
                  type="button"
                  className={active ? "active" : ""}
                  onClick={() => {
                    onChange(
                      setField(
                        graph,
                        binding.id,
                        binding.field,
                        token(item.key),
                      ),
                    );
                    setBinding(null);
                    onMessage(
                      tr("{0} 已联动到自动设置。", [item.label]),
                    );
                  }}
                >
                  <span>
                    <strong>{item.label}</strong>
                    <small>{`{{${item.key}}}`}</small>
                  </span>
                  <em>{resolvedText(item.key, settings)}</em>
                </button>
              );
            })}
            <button
              type="button"
              className="binding-clear"
              onClick={() => {
                onChange(
                  setField(
                    graph,
                    binding.id,
                    binding.field,
                    bindingField.kind === "number" ? 0 : "",
                  ),
                );
                setBinding(null);
                onMessage(tr("占位符已解除。"));
              }}
            >
              <Unlink size={15} />
              {tr("解除占位符")}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function NodeField({
  field,
  classType,
  graph,
  settings,
  onSettings,
  onEdit,
  onOpenPrompt,
  onBind,
}: {
  field: Field;
  classType: string;
  graph: Workflow;
  settings: Settings;
  onSettings: (next: Settings) => void;
  onEdit: (value: unknown) => void;
  onOpenPrompt: () => void;
  onBind: () => void;
}) {
  const key = bindingKeyOf(field.value);
  const binding = key ? bindingOf(key) : undefined;
  const prompt = isPromptField(classType, field.name);

  const head = (
    <span>
      {field.name}
      <span className="node-actions">
        {key && (
          <button type="button" className="node-chip" onClick={onBind}>
            <Link2 size={11} />
            {binding?.label ?? key}
            <em>{resolvedText(key, settings)}</em>
          </button>
        )}
        {!key && field.kind !== "link" && (
          <button
            type="button"
            className="node-chip ghost"
            aria-label={tr("绑定到自动设置")}
            onClick={onBind}
          >
            <Link2 size={11} />
            {tr("联动")}
          </button>
        )}
        {prompt && (
          <button type="button" className="node-expand" onClick={onOpenPrompt}>
            <Pencil size={12} />
            {tr("编辑")}
          </button>
        )}
      </span>
    </span>
  );

  if (field.kind === "link") {
    const from = field.link?.[0] ?? "";
    return (
      <div className="node-link">
        <span>{field.name}</span>
        <em>
          ← #{from} {graph[from] ? nodeTitle(graph, from) : ""}
        </em>
      </div>
    );
  }
  if (key) {
    const item = bindingOf(key);
    const label = item?.label ?? key;
    const wide = key === "prompt" || key === "negative";
    const current = bindingValue(key, settings);
    return (
      <div className="node-field node-bound">
        {head}
        {wide ? (
          <textarea
            rows={3}
            className="bound-editor"
            aria-label={tr("自动设置 · {0}", [label])}
            value={current}
            onChange={(event) =>
              onSettings(applyBinding(key, settings, event.target.value))
            }
          />
        ) : (
          <input
            type={item?.kind === "number" ? "number" : "text"}
            inputMode={item?.kind === "number" ? "decimal" : undefined}
            className="bound-editor"
            aria-label={tr("自动设置 · {0}", [label])}
            value={current}
            onChange={(event) =>
              onSettings(applyBinding(key, settings, event.target.value))
            }
          />
        )}
      </div>
    );
  }
  if (field.kind === "select") {
    return (
      <label className="node-field">
        {head}
        <select
          value={String(field.value ?? "")}
          onChange={(event) => onEdit(event.target.value)}
        >
          {(field.options ?? []).map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </label>
    );
  }
  if (field.kind === "toggle") {
    return (
      <label className="node-field node-toggle">
        {head}
        <input
          type="checkbox"
          checked={Boolean(field.value)}
          onChange={(event) => onEdit(event.target.checked)}
        />
      </label>
    );
  }
  if (field.kind === "number") {
    return (
      <label className="node-field">
        {head}
        <input
          type="number"
          inputMode="decimal"
          value={String(field.value ?? 0)}
          min={field.min}
          max={field.max}
          step={field.step}
          onChange={(event) => onEdit(coerceField(field, event.target.value))}
        />
      </label>
    );
  }
  if (field.kind === "longtext") {
    return (
      <label className="node-field node-longtext">
        {head}
        <textarea
          rows={3}
          value={String(field.value ?? "")}
          onChange={(event) => onEdit(event.target.value)}
        />
      </label>
    );
  }
  return (
    <label className="node-field node-json">
      {head}
      <textarea
        rows={2}
        value={
          typeof field.value === "string"
            ? field.value
            : JSON.stringify(field.value)
        }
        onChange={(event) => onEdit(coerceField(field, event.target.value))}
      />
    </label>
  );
}

/**
 * Dependency order for the vertical flow: a node appears after every node it
 * consumes. Cycles fall back to id order so the list is never empty.
 */
export function flowOrder(graph: Workflow): string[] {
  const ids = Object.keys(graph);
  const parents = new Map<string, string[]>();
  for (const id of ids) {
    const list: string[] = [];
    for (const value of Object.values(graph[id].inputs ?? {}))
      if (Array.isArray(value) && typeof value[0] === "string" && graph[value[0]])
        list.push(value[0]);
    parents.set(id, [...new Set(list)]);
  }
  const depth = new Map<string, number>();
  const walk = (id: string, stack: Set<string>): number => {
    const known = depth.get(id);
    if (known !== undefined) return known;
    if (stack.has(id)) return 0;
    stack.add(id);
    let value = 0;
    for (const parent of parents.get(id) ?? [])
      value = Math.max(value, walk(parent, stack) + 1);
    stack.delete(id);
    depth.set(id, value);
    return value;
  };
  for (const id of ids) walk(id, new Set());
  return [...ids].sort((a, b) => {
    const byDepth = (depth.get(a) ?? 0) - (depth.get(b) ?? 0);
    return byDepth || a.localeCompare(b, "en", { numeric: true });
  });
}

/** First non-empty prompt text found in a graph, for compact summaries. */
export function workflowSummary(graph: Workflow | null) {
  if (!graph) return "";
  for (const node of Object.values(graph))
    if (/encod/i.test(node.class_type)) {
      const text = String(node.inputs?.text ?? "").trim();
      if (text) return text;
    }
  return "";
}

/** Nodes whose output the live preview should follow. */
export function previewNodeIds(graph: Workflow | null): string[] {
  if (!graph) return [];
  return Object.keys(graph).filter((id) =>
    isPreviewNode(graph[id]?.class_type ?? ""),
  );
}

/** Small helper kept for callers that only need a readable field preview. */
export function previewOf(field: Field, settings: Settings) {
  const key = bindingKeyOf(field.value);
  return key ? resolvedText(key, settings) : fieldPreview(field);
}
