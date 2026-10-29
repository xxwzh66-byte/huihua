import { useEffect, useState } from "react";
import { Download, FolderOpen, Save, Trash2 } from "lucide-react";
import { t as tr, locale } from "./i18n";
import { Modal } from "./Modal";
import type { Workflow } from "./api";
import {
  deleteWorkflow,
  downloadWorkflow,
  openWorkflow,
  readWorkflows,
  saveWorkflow,
  type SavedWorkflow,
} from "./workflowLibrary";
import "./workflow-shelf.css";

/**
 * Saved workflow shelf. v1.14 adds the two actions the Atelier was missing:
 * pick a saved workflow from a selector instead of a modal, and name the graph
 * you are editing (the name is what the render bar and the library show).
 */
export default function WorkflowShelf({
  graph,
  name,
  id,
  onName,
  onLoad,
  onSaved,
  onMessage,
  onError,
}: {
  graph: Workflow | null;
  name: string;
  id: string;
  onName: (name: string) => void;
  onLoad: (graph: Workflow, name: string, id: string) => void;
  onSaved: (name: string, id: string) => void;
  onMessage: (text: string) => void;
  onError: (text: string) => void;
}) {
  const [items, setItems] = useState<SavedWorkflow[]>(() => readWorkflows());
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setItems(readWorkflows());
  }, []);

  function pick(nextId: string) {
    if (!nextId) {
      onName("");
      onSaved("", "");
      return;
    }
    const item = items.find((entry) => entry.id === nextId);
    if (!item) return;
    try {
      onLoad(openWorkflow(item), item.name, item.id);
      onMessage(tr("已载入「{0}」。", [item.name]));
      onError("");
    } catch (e) {
      onError(String(e));
    }
  }

  function save() {
    if (!graph) return;
    const label = name.trim() || tr("未命名工作流");
    try {
      setBusy(true);
      const next = saveWorkflow(label, graph, id || undefined);
      setItems(next);
      const saved = next.find(
        (item) =>
          item.name === label &&
          (id ? item.id === id : true),
      );
      if (saved) onSaved(saved.name, saved.id);
      onMessage(tr("工作流已保存到本机。"));
      onError("");
    } catch (e) {
      onError(String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="workflow-shelf">
      <div className="shelf-select">
        <label className="shelf-picker">
          <FolderOpen size={15} />
          <select
            value={items.some((item) => item.id === id) ? id : ""}
            aria-label={tr("选择工作流")}
            onChange={(event) => pick(event.target.value)}
          >
            <option value="">{tr("选择工作流")}</option>
            {items.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="shelf-count"
          onClick={() => setOpen(true)}
          aria-haspopup="dialog"
        >
          <FolderOpen size={14} />
          {tr("已保存 {0} 个工作流", [items.length])}
        </button>
      </div>
      <div className="shelf-save">
        <input
          value={name}
          maxLength={120}
          placeholder={tr("工作流命名")}
          aria-label={tr("工作流命名")}
          onChange={(event) => onName(event.target.value)}
        />
        <button
          type="button"
          className="shelf-save-button"
          disabled={!graph || busy}
          onClick={save}
        >
          <Save size={15} />
          {id ? tr("保存修改") : tr("保存工作流")}
        </button>
        <button
          type="button"
          className="shelf-open-button"
          disabled={!graph}
          onClick={() => {
            if (graph) {
              downloadWorkflow(name.trim() || "workflow", graph);
              onMessage(tr("工作流已导出为 JSON 文件。"));
            }
          }}
        >
          <Download size={15} />
          {tr("导出")}
        </button>
      </div>
      {open && (
        <Modal
          title={tr("我的工作流")}
          className="shelf-dialog"
          onClose={() => setOpen(false)}
        >
          {items.length === 0 ? (
            <p className="shelf-empty">
              {tr("还没有保存的工作流。导入后点「保存工作流」即可留存。")}
            </p>
          ) : (
            <ul className="shelf-list">
              {items.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    className="shelf-item"
                    onClick={() => {
                      pick(item.id);
                      setOpen(false);
                    }}
                  >
                    <span>
                      <strong>{item.name}</strong>
                      <small>
                        {tr("{0} 个节点", [item.nodes])} ·{" "}
                        {new Date(item.at).toLocaleDateString(locale(), {
                          day: "numeric",
                          month: "short",
                        })}
                      </small>
                    </span>
                  </button>
                  <button
                    type="button"
                    className="shelf-delete"
                    aria-label={tr("删除 {0}", [item.name])}
                    onClick={() => {
                      setItems(deleteWorkflow(item.id));
                      if (item.id === id) onSaved("", "");
                      onMessage(tr("工作流已删除。"));
                    }}
                  >
                    <Trash2 size={15} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Modal>
      )}
    </div>
  );
}
