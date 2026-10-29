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
 * Saved workflow shelf: imported API graphs stay on the device so an edited
 * graph survives an app restart. Kept apart from `WorkflowCanvas` because the
 * canvas only edits the graph it is handed.
 */
export default function WorkflowShelf({
  graph,
  onLoad,
  onMessage,
  onError,
}: {
  graph: Workflow | null;
  onLoad: (graph: Workflow, name: string, id: string) => void;
  onMessage: (text: string) => void;
  onError: (text: string) => void;
}) {
  const [items, setItems] = useState<SavedWorkflow[]>(() => readWorkflows());
  const [name, setName] = useState("");
  const [currentId, setCurrentId] = useState("");
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setItems(readWorkflows());
  }, []);

  function save() {
    if (!graph) return;
    try {
      setBusy(true);
      const next = saveWorkflow(
        name || tr("Workflow sans titre"),
        graph,
        currentId || undefined,
      );
      setItems(next);
      const saved = next.find(
        (item) => item.name === (name || tr("Workflow sans titre")),
      );
      if (saved) setCurrentId(saved.id);
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
      <div className="shelf-save">
        <input
          value={name}
          maxLength={120}
          placeholder={tr("工作流名称")}
          aria-label={tr("工作流名称")}
          onChange={(e) => setName(e.target.value)}
        />
        <button
          type="button"
          className="shelf-save-button"
          disabled={!graph || busy}
          onClick={save}
        >
          <Save size={15} />
          {currentId ? tr("保存修改") : tr("保存工作流")}
        </button>
        <button
          type="button"
          className="shelf-open-button"
          disabled={!graph}
          onClick={() => {
            if (graph) {
              downloadWorkflow(name || "workflow", graph);
              onMessage(tr("工作流已导出为 JSON 文件。"));
            }
          }}
        >
          <Download size={15} />
          {tr("导出")}
        </button>
      </div>
      <button
        type="button"
        className="shelf-count"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
      >
        <FolderOpen size={14} />
        {tr("已保存 {0} 个工作流", [items.length])}
      </button>
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
                      try {
                        onLoad(openWorkflow(item), item.name, item.id);
                        setName(item.name);
                        setCurrentId(item.id);
                        setOpen(false);
                        onMessage(tr("已载入「{0}」。", [item.name]));
                        onError("");
                      } catch (e) {
                        onError(String(e));
                      }
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
                      if (item.id === currentId) setCurrentId("");
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
