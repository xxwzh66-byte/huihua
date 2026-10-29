import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ChevronDown,
  ChevronUp,
  Maximize2,
  Minus,
  Pencil,
  Plus,
} from "lucide-react";
import { t as tr } from "./i18n";
import { Modal } from "./Modal";
import PromptEditor from "./PromptEditor";
import { type ObjectInfo, type Workflow } from "./api";
import {
  CARD_WIDTH,
  coerceField,
  isPromptField,
  layoutGraph,
  nodeFields,
  nodeTitle,
  setField,
  type Field,
} from "./workflowGraph";
import "./workflow-canvas.css";

type Props = {
  graph: Workflow;
  info: ObjectInfo;
  onChange: (next: Workflow) => void;
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
};

const accentOf = (classType: string) => ACCENTS[classType] ?? "other";

const ZOOMS = [0.5, 0.6, 0.7, 0.8, 0.9, 1, 1.1, 1.25, 1.4, 1.6];

export default function WorkflowCanvas({ graph, info, onChange, onMessage }: Props) {
  const [zoom, setZoom] = useState(1);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [editing, setEditing] = useState<{ id: string; field: string } | null>(
    null,
  );
  const scroller = useRef<HTMLDivElement>(null);
  const cards = useRef(new Map<string, HTMLElement>());
  const sizes = useRef<Record<string, number>>({});
  const [heights, setHeights] = useState<Record<string, number>>({});

  const measure = useCallback(() => {
    let changed = false;
    for (const [id, element] of cards.current) {
      const value = element.offsetHeight;
      if (!value) continue;
      if (Math.abs((sizes.current[id] ?? 0) - value) > 2) {
        sizes.current[id] = value;
        changed = true;
      }
    }
    if (changed) setHeights({ ...sizes.current });
  }, []);

  useLayoutEffect(() => {
    measure();
  });

  useEffect(() => {
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => measure());
    for (const node of cards.current.values()) observer.observe(node);
    return () => observer.disconnect();
  });

  const layout = useMemo(() => layoutGraph(graph, heights), [graph, heights]);
  const placed = useMemo(
    () => new Map(layout.nodes.map((node) => [node.id, node])),
    [layout.nodes],
  );
  const plan = useMemo(
    () =>
      Object.keys(graph).map((id) => ({
        id,
        fields: nodeFields(graph, info, id),
      })),
    [graph, info],
  );
  const fieldsOf = useMemo(
    () => new Map(plan.map((entry) => [entry.id, entry.fields])),
    [plan],
  );

  const step = (direction: 1 | -1) =>
    setZoom((current) => {
      const index = ZOOMS.indexOf(current);
      const next = index < 0 ? 1 : index + direction;
      return ZOOMS[Math.max(0, Math.min(ZOOMS.length - 1, next))];
    });

  const editingNode = editing ? graph[editing.id] : null;
  const editingField = editing
    ? (fieldsOf.get(editing.id) ?? []).find(
        (field) => field.name === editing.field,
      )
    : null;

  return (
    <div className="workflow-canvas">
      <div className="canvas-toolbar">
        <span className="canvas-count">
          {tr("{0} nœuds · {1} liens", [
            Object.keys(graph).length,
            layout.edges.length,
          ])}
        </span>
        <div className="canvas-zoom">
          <button
            type="button"
            aria-label={tr("Réduire le zoom")}
            disabled={zoom === ZOOMS[0]}
            onClick={() => step(-1)}
          >
            <Minus size={15} />
          </button>
          <span>{Math.round(zoom * 100)}%</span>
          <button
            type="button"
            aria-label={tr("Agrandir le zoom")}
            disabled={zoom === ZOOMS[ZOOMS.length - 1]}
            onClick={() => step(1)}
          >
            <Plus size={15} />
          </button>
          <button
            type="button"
            aria-label={tr("Revenir à la vue d’ensemble")}
            onClick={() => {
              setZoom(1);
              scroller.current?.scrollTo({ left: 0, top: 0 });
            }}
          >
            <Maximize2 size={14} />
          </button>
        </div>
      </div>
      <div className="canvas-scroller" ref={scroller} tabIndex={0}>
        <div
          className="canvas-plane"
          style={{
            width: Math.max(layout.width, 300) * zoom + 32,
            height: Math.max(layout.height, 140) * zoom + 32,
          }}
        >
          <div
            className="canvas-inner"
            style={{
              transform: `scale(${zoom})`,
              width: Math.max(layout.width, 300),
              height: Math.max(layout.height, 140),
            }}
          >
            <svg
              className="canvas-edges"
              width={Math.max(layout.width, 300)}
              height={Math.max(layout.height, 140)}
              aria-hidden="true"
            >
              {layout.edges.map((edge, index) => {
                const from = placed.get(edge.from);
                const to = placed.get(edge.to);
                if (!from || !to) return null;
                const x1 = from.x + CARD_WIDTH;
                const y1 = from.y + 26;
                const x2 = to.x;
                const y2 = to.y + 26;
                const bend = Math.max(26, (x2 - x1) * 0.5);
                return (
                  <path
                    key={`${edge.from}-${edge.to}-${edge.field}-${index}`}
                    d={`M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}`}
                    className={`canvas-edge ${accentOf(graph[edge.to]?.class_type ?? "")}`}
                  />
                );
              })}
            </svg>
            {layout.nodes.map((node) => {
              const data = graph[node.id];
              if (!data) return null;
              const hidden = Boolean(collapsed[node.id]);
              return (
                <article
                  key={node.id}
                  ref={(element) => {
                    if (element) cards.current.set(node.id, element);
                    else cards.current.delete(node.id);
                  }}
                  className={`canvas-card ${accentOf(data.class_type)}`}
                  style={{ left: node.x, top: node.y, width: CARD_WIDTH }}
                >
                  <header>
                    <span className="node-index">#{node.id}</span>
                    <button
                      type="button"
                      className="node-title"
                      aria-expanded={!hidden}
                      onClick={() =>
                        setCollapsed({ ...collapsed, [node.id]: !hidden })
                      }
                    >
                      <strong>{nodeTitle(graph, node.id)}</strong>
                      <small>{data.class_type}</small>
                      {hidden ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
                    </button>
                  </header>
                  {!hidden && (
                    <div className="node-fields">
                      {(fieldsOf.get(node.id) ?? []).map((field) => (
                        <NodeField
                          key={field.name}
                          field={field}
                          classType={data.class_type}
                          graph={graph}
                          onEdit={(value) => onChange(setField(graph, node.id, field.name, value))}
                          onOpenPrompt={() =>
                            setEditing({ id: node.id, field: field.name })
                          }
                        />
                      ))}
                      {(fieldsOf.get(node.id) ?? []).length === 0 && (
                        <p className="node-empty">{tr("Aucune entrée.")}</p>
                      )}
                    </div>
                  )}
                </article>
              );
            })}
            {layout.nodes.length === 0 && (
              <p className="canvas-empty">
                {tr("Ce workflow ne contient aucun nœud.")}
              </p>
            )}
          </div>
        </div>
      </div>
      {editing && editingField && editingNode && (
        <Modal
          title={tr("Modifier {0}", [editingField.name])}
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
                typeof editingField.value === "string"
                  ? editingField.value
                  : "",
              negative: "",
            }}
            onChange={(next) =>
              onChange(setField(graph, editing.id, editing.field, next.positive))
            }
            onClose={() => {
              setEditing(null);
              onMessage(tr("Prompt mis à jour dans le workflow."));
            }}
          />
        </Modal>
      )}
    </div>
  );
}

function NodeField({
  field,
  classType,
  graph,
  onEdit,
  onOpenPrompt,
}: {
  field: Field;
  classType: string;
  graph: Workflow;
  onEdit: (value: unknown) => void;
  onOpenPrompt: () => void;
}) {
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
  if (field.kind === "select") {
    return (
      <label className="node-field">
        <span>{field.name}</span>
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
        <span>{field.name}</span>
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
        <span>{field.name}</span>
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
        <span>
          {field.name}
          {isPromptField(classType, field.name) && (
            <button
              type="button"
              className="node-expand"
              onClick={onOpenPrompt}
            >
              <Pencil size={12} />
              {tr("Éditer")}
            </button>
          )}
        </span>
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
      <span>{field.name}</span>
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
