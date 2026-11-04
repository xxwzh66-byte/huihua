import { useRef, useState } from "react";
import { Check, Copy, Download, FileCode2, Plus, Trash2, Upload } from "lucide-react";
import { t as tr } from "./i18n";
import { Modal } from "./Modal";
import {
  deleteTemplate,
  duplicateTemplate,
  exportTemplates,
  importTemplates,
  newTemplate,
  readTemplates,
  renameTemplate,
  saveTemplate,
  TEMPLATE_LIMIT,
  type PromptTemplate,
} from "./promptTemplates";
import "./template-manager.css";

/**
 * v1.21: templates used to be import-only (a skill folder) and all editing
 * lived inside the instruction box. This dialog is the one place where a
 * template is created, named, duplicated, renamed, exported and deleted.
 */
export default function TemplateManager({
  selected,
  onSelect,
  onClose,
  onMessage,
  onError,
}: {
  selected: string;
  onSelect: (id: string) => void;
  onClose: () => void;
  onMessage: (text: string) => void;
  onError: (text: string) => void;
}) {
  const [list, setList] = useState<PromptTemplate[]>(() => readTemplates());
  const [name, setName] = useState("");
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(
    null,
  );
  const file = useRef<HTMLInputElement>(null);

  const refresh = () => setList(readTemplates());

  function create() {
    try {
      const made = newTemplate(name || tr("Mon modèle"));
      saveTemplate(made);
      refresh();
      onSelect(made.id);
      setName("");
      onMessage(tr("Modèle « {0} » créé.", [made.name]));
    } catch (error) {
      onError(String(error));
    }
  }

  function rename(id: string) {
    if (!renaming) return;
    try {
      renameTemplate(id, renaming.name);
      refresh();
      setRenaming(null);
      onMessage(tr("Nom enregistré."));
    } catch (error) {
      onError(String(error));
    }
  }

  function duplicate(id: string) {
    try {
      const { name: copy } = duplicateTemplate(id);
      refresh();
      onMessage(tr("Modèle « {0} » créé.", [copy]));
    } catch (error) {
      onError(String(error));
    }
  }

  function remove(id: string) {
    try {
      deleteTemplate(id);
      refresh();
      if (selected === id) onSelect("");
      onMessage(tr("Modèle supprimé."));
    } catch (error) {
      onError(String(error));
    }
  }

  function exportAll() {
    try {
      const text = exportTemplates();
      const blob = new Blob([text], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "huihua-templates.json";
      link.click();
      URL.revokeObjectURL(url);
      onMessage(tr("{0} modèles exportés.", [list.length]));
    } catch (error) {
      onError(String(error));
    }
  }

  async function importFile(picked: File | undefined) {
    if (!picked) return;
    try {
      const added = importTemplates(await picked.text());
      refresh();
      onSelect(added[0].id);
      onMessage(tr("{0} modèles importés.", [added.length]));
    } catch (error) {
      onError(String(error));
    } finally {
      if (file.current) file.current.value = "";
    }
  }

  return (
    <Modal
      title={tr("Modèles de prompt")}
      className="template-manager"
      onClose={onClose}
    >
      <p className="template-note">
        {tr(
          "Un modèle = une instruction d’API nommée. Il est enregistré sur cet appareil et peut être exporté pour un autre.",
        )}
      </p>

      <div className="template-create">
        <input
          value={name}
          maxLength={120}
          placeholder={tr("Nom du nouveau modèle")}
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") create();
          }}
        />
        <button className="primary" onClick={create}>
          <Plus size={16} /> {tr("新建")}
        </button>
      </div>

      <ul className="template-list">
        {list.map((item) => (
          <li key={item.id} className={item.id === selected ? "selected" : ""}>
            {renaming?.id === item.id ? (
              <div className="template-rename">
                <input
                  autoFocus
                  value={renaming.name}
                  maxLength={120}
                  onChange={(event) =>
                    setRenaming({ id: item.id, name: event.target.value })
                  }
                  onKeyDown={(event) => {
                    if (event.key === "Enter") rename(item.id);
                    if (event.key === "Escape") setRenaming(null);
                  }}
                />
                <button
                  aria-label={tr("保存")}
                  onClick={() => rename(item.id)}
                >
                  <Check size={15} />
                </button>
              </div>
            ) : (
              <button
                className="template-pick"
                onClick={() => {
                  onSelect(item.id);
                  onMessage(tr("Modèle « {0} » sélectionné.", [item.name]));
                }}
              >
                <strong>{item.name}</strong>
                <small>
                  {item.description || tr("Sans description")} ·{" "}
                  {tr("{0} variables", [item.params.length])}
                  {item.source ? ` · ${item.source}` : ""}
                </small>
              </button>
            )}
            <div className="template-tools">
              <button
                aria-label={tr("重命名")}
                onClick={() => setRenaming({ id: item.id, name: item.name })}
              >
                <FileCode2 size={15} />
              </button>
              <button
                aria-label={tr("复制")}
                onClick={() => duplicate(item.id)}
              >
                <Copy size={15} />
              </button>
              <button
                aria-label={tr("Supprimer {0}", [item.name])}
                onClick={() => remove(item.id)}
              >
                <Trash2 size={15} />
              </button>
            </div>
          </li>
        ))}
      </ul>

      {!list.length && (
        <p className="template-empty">
          {tr(
            "Aucun modèle pour l’instant. Créez-en un ci-dessus, ou importez un dossier skill.",
          )}
        </p>
      )}

      <div className="template-actions">
        <button disabled={!list.length} onClick={exportAll}>
          <Download size={16} /> {tr("导出全部")}
        </button>
        <label className="template-import">
          <Upload size={16} /> {tr("导入 JSON")}
          <input
            ref={file}
            type="file"
            accept=".json,application/json"
            onChange={(event) => void importFile(event.target.files?.[0])}
          />
        </label>
        <small>
          {list.length} / {TEMPLATE_LIMIT}
        </small>
      </div>
    </Modal>
  );
}
