import { useEffect, useMemo, useRef, useState } from "react";
import {
  Box,
  Boxes,
  Frame,
  ImageDown,
  Link2,
  Minus,
  Pencil,
  Plus,
  SlidersHorizontal,
  Type,
  Unlink,
  X,
} from "lucide-react";
import { t as tr } from "./i18n";
import { Modal } from "./Modal";
import PromptEditor from "./PromptEditor";
import { type ObjectInfo, type Workflow } from "./api";
import {
  coerceField,
  isPromptField,
  layoutGraph,
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

/** One glyph per node family, so a graph reads at a glance on a phone. */
function iconOf(accent: string) {
  if (accent === "loader") return <Boxes size={15} />;
  if (accent === "prompt") return <Type size={15} />;
  if (accent === "sample") return <SlidersHorizontal size={15} />;
  if (accent === "latent") return <Frame size={15} />;
  if (accent === "output") return <ImageDown size={15} />;
  return <Box size={15} />;
}

/** Output nodes whose image is the live preview of the Atelier. */
export function isPreviewNode(classType: string) {
  return /previewimage|saveimage/i.test(classType);
}

const NODE_WIDTH = 132;
const NODE_HEIGHT = 78;
const ZOOM_MIN = 0.5;
const ZOOM_MAX = 1.3;
const ZOOM_STEP = 0.15;

/**
 * v1.14: the canvas is a real node graph now — compact icon nodes placed by
 * `layoutGraph`, bezier wires between them, and parameters revealed only for the
 * node you tap. The previous build stacked every field of every node in one long
 * list, which is unreadable once a graph leaves the 7-node default.
 */
export default function WorkflowCanvas({
  graph,
  info,
  settings,
  onChange,
  onSettings,
  onMessage,
}: Props) {
  const [selected, setSelected] = useState("");
  const [zoom, setZoom] = useState(0.8);
  const [editing, setEditing] = useState<{ id: string; field: string } | null>(
    null,
  );
  const [binding, setBinding] = useState<{ id: string; field: string } | null>(
    null,
  );
  const viewport = useRef<HTMLDivElement | null>(null);
  const fitted = useRef("");

  const layout = useMemo(
    () =>
      layoutGraph(graph, {}, {
        width: NODE_WIDTH,
        gapX: 40,
        gapY: 16,
        minHeight: NODE_HEIGHT,
        collapsedHeight: NODE_HEIGHT,
      }),
    [graph],
  );
  const plan = useMemo(
    () =>
      new Map(
        Object.keys(graph).map((id) => [id, nodeFields(graph, info, id)]),
      ),
    [graph, info],
  );
  const bound = useMemo(() => usedBindings(graph), [graph]);

  const active = graph[selected] ? selected : "";
  const activeNode = active ? graph[active] : null;
  const activeFields = active ? (plan.get(active) ?? []) : [];
  const accent = activeNode ? accentOf(activeNode.class_type) : "other";

  const editingNode = editing ? graph[editing.id] : null;
  const editingField = editing
    ? (plan.get(editing.id) ?? []).find((f) => f.name === editing.field)
    : null;
  const bindingNode = binding ? graph[binding.id] : null;
  const bindingField = binding
    ? (plan.get(binding.id) ?? []).find((f) => f.name === binding.field)
    : null;

  const step = (delta: number) =>
    setZoom((value) =>
      Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round((value + delta) * 100) / 100)),
    );

  const fitZoom = () => {
    const room = (viewport.current?.clientWidth ?? 0) - 12;
    if (room <= 0 || layout.width <= 0) return;
    const fit = Math.round((room / layout.width) * 100) / 100;
    setZoom(Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, fit)));
  };

  // Small graphs fit the phone width; wide ones stay readable at 80% and scroll
  // sideways instead of shrinking into unreadable 6px icons.
  const signature = `${Object.keys(graph).length}:${layout.width}`;
  useEffect(() => {
    if (fitted.current === signature) return;
    const box = viewport.current;
    if (!box) return;
    const room = box.clientWidth - 12;
    if (room <= 0 || layout.width <= 0) return;
    fitted.current = signature;
    const fit = Math.round((room / layout.width) * 100) / 100;
    setZoom(fit >= 0.6 ? Math.min(ZOOM_MAX, fit) : 0.8);
  }, [signature, layout.width]);

  // Tapping a node that sits off-screen brings it into view.
  useEffect(() => {
    if (!active) return;
    const node = layout.nodes.find((item) => item.id === active);
    if (!node) return;
    viewport.current?.scrollTo({
      left: Math.max(0, node.x * zoom - 24),
      behavior: "smooth",
    });
  }, [active, layout.nodes, zoom]);

  if (!Object.keys(graph).length)
    return <p className="canvas-empty">{tr("这个工作流没有节点。")}</p>;

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
        <div className="canvas-zoom">
          <button
            type="button"
            aria-label={tr("缩小")}
            disabled={zoom <= ZOOM_MIN}
            onClick={() => step(-ZOOM_STEP)}
          >
            <Minus size={14} />
          </button>
          <button
            type="button"
            className="canvas-fit"
            aria-label={tr("适应宽度")}
            onClick={fitZoom}
          >
            {Math.round(zoom * 100)}%
          </button>
          <button
            type="button"
            aria-label={tr("放大")}
            disabled={zoom >= ZOOM_MAX}
            onClick={() => step(ZOOM_STEP)}
          >
            <Plus size={14} />
          </button>
        </div>
      </div>

      {bound.length > 0 && (
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
      )}

      <div className="canvas-scroll" ref={viewport}>
        <div
          className="canvas-stage"
          style={{
            width: layout.width * zoom,
            height: layout.height * zoom,
          }}
        >
          <div
            className="canvas-graph"
            style={{
              width: layout.width,
              height: layout.height,
              transform: `scale(${zoom})`,
            }}
          >
            <svg
              className="canvas-edges"
              width={layout.width}
              height={layout.height}
              aria-hidden="true"
            >
              {layout.edges.map((edge, index) => {
                const from = layout.nodes.find((n) => n.id === edge.from);
                const to = layout.nodes.find((n) => n.id === edge.to);
                if (!from || !to) return null;
                const x1 = from.x + NODE_WIDTH;
                const y1 = from.y + NODE_HEIGHT / 2;
                const x2 = to.x;
                const y2 = to.y + NODE_HEIGHT / 2;
                const curve = Math.max(26, Math.abs(x2 - x1) / 2);
                const hot =
                  active && (edge.from === active || edge.to === active);
                return (
                  <path
                    key={`${edge.from}-${edge.to}-${edge.field}-${index}`}
                    d={`M ${x1} ${y1} C ${x1 + curve} ${y1}, ${x2 - curve} ${y2}, ${x2} ${y2}`}
                    className={hot ? "edge hot" : "edge"}
                  />
                );
              })}
            </svg>
            {layout.nodes.map((node) => {
              const data = graph[node.id];
              if (!data) return null;
              const nodeAccent = accentOf(data.class_type);
              const isActive = node.id === active;
              const wired = layout.edges.some((e) => e.to === node.id);
              return (
                <button
                  key={node.id}
                  type="button"
                  className={`graph-node ${nodeAccent}${isActive ? " selected" : ""}`}
                  style={{
                    left: node.x,
                    top: node.y,
                    width: NODE_WIDTH,
                    height: NODE_HEIGHT,
                  }}
                  aria-pressed={isActive}
                  aria-label={tr("{0} · 节点 {1}", [
                    nodeTitle(graph, node.id),
                    node.id,
                  ])}
                  onClick={() => setSelected(isActive ? "" : node.id)}
                >
                  <span className="graph-icon">
                    {iconOf(nodeAccent)}
                    {wired && <i className="graph-dot" />}
                  </span>
                  <span className="graph-label">{nodeTitle(graph, node.id)}</span>
                  <small>
                    #{node.id} · {data.class_type}
                  </small>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {activeNode ? (
        <section className={`canvas-detail ${accent}`} aria-live="polite">
          <header className="detail-head">
            <span className="graph-icon">{iconOf(accent)}</span>
            <span className="detail-name">
              <strong>{nodeTitle(graph, active)}</strong>
              <small>
                #{active} · {activeNode.class_type}
              </small>
            </span>
            <button
              type="button"
              className="detail-close"
              aria-label={tr("关闭参数")}
              onClick={() => setSelected("")}
            >
              <X size={16} />
            </button>
          </header>
          <div className="node-fields">
            {activeFields.map((field) => (
              <NodeField
                key={field.name}
                field={field}
                classType={activeNode.class_type}
                graph={graph}
                settings={settings}
                onSettings={onSettings}
                onEdit={(value) =>
                  onChange(setField(graph, active, field.name, value))
                }
                onOpenPrompt={() => setEditing({ id: active, field: field.name })}
                onBind={() => setBinding({ id: active, field: field.name })}
              />
            ))}
            {activeFields.length === 0 && (
              <p className="node-empty">{tr("没有输入项。")}</p>
            )}
          </div>
        </section>
      ) : (
        <p className="canvas-hint">{tr("点击节点查看并修改参数。")}</p>
      )}

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
              const isActive =
                typeof bindingField.value === "string" &&
                bindingKeyOf(bindingField.value) === item.key;
              return (
                <button
                  key={item.key}
                  type="button"
                  className={isActive ? "active" : ""}
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
                    onMessage(tr("{0} 已联动到自动设置。", [item.label]));
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
    const options = field.options ?? [];
    const value = String(field.value ?? "");
    // v1.14: a graph imported from another install can hold a value this server
    // does not offer. Show it as a disabled first option instead of silently
    // rendering an unrelated one.
    const stale = value !== "" && !options.includes(value);
    return (
      <label className="node-field">
        {head}
        <select
          value={value}
          onChange={(event) => onEdit(event.target.value)}
        >
          {stale && (
            <option value={value}>{`${value} · ${tr("不可用")}`}</option>
          )}
          {value === "" && <option value="">{tr("未选择")}</option>}
          {options.map((option) => (
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
