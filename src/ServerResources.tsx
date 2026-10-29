import { useMemo, useState } from "react";
import { ChevronRight, Cpu, Layers, Search } from "lucide-react";
import { t as tr } from "./i18n";
import { type ObjectInfo, type Workflow } from "./api";
import {
  loadedFrom,
  serverResources,
  type ResourceGroup,
} from "./serverInventory";
import "./server-resources.css";

export default function ServerResources({
  info,
  workflow,
}: {
  info: ObjectInfo;
  workflow: Workflow | null;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<string>("checkpoints");
  const groups = useMemo(() => serverResources(info), [info]);
  const loaded = useMemo(() => loadedFrom(workflow, info), [workflow, info]);
  const total = groups.reduce((sum, group) => sum + group.items.length, 0);
  const needle = query.trim().toLowerCase();
  const matches = (group: ResourceGroup) =>
    !needle ||
    group.label.toLowerCase().includes(needle) ||
    group.items.some((item) => item.toLowerCase().includes(needle));

  if (!total)
    return (
      <p className="resources-empty">
        {tr(
          "Aucune ressource détectée. Vérifiez que le serveur ComfyUI charge bien ses dossiers de modèles.",
        )}
      </p>
    );

  const inUse = (item: string) =>
    item === loaded.checkpoint ||
    item === loaded.vae ||
    item === loaded.clip ||
    loaded.loras.includes(item);

  return (
    <div className="server-resources">
      <header className="resources-head">
        <span>
          <Cpu size={15} /> {tr("{0} ressources sur ce serveur", [total])}
        </span>
        <label className="resources-search">
          <Search size={14} />
          <input
            value={query}
            spellCheck={false}
            placeholder={tr("Filtrer les modèles…")}
            aria-label={tr("Filtrer les modèles")}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
      </header>
      <dl className="resources-loaded">
        <div>
          <dt>{tr("Modèle")}</dt>
          <dd>{loaded.checkpoint || tr("Non défini")}</dd>
        </div>
        <div>
          <dt>{tr("Encodeur de texte")}</dt>
          <dd>{loaded.clip || tr("Inclus dans le checkpoint")}</dd>
        </div>
        <div>
          <dt>VAE</dt>
          <dd>{loaded.vae || tr("Inclus dans le checkpoint")}</dd>
        </div>
        <div>
          <dt>LoRA</dt>
          <dd>
            {loaded.loras.length
              ? loaded.loras.join(", ")
              : tr("Aucun LoRA actif")}
          </dd>
        </div>
      </dl>
      <div className="resources-groups">
        {groups.filter((group) => group.items.length && matches(group)).map((group) => {
          const expanded = open === group.key;
          const items = needle
            ? group.items.filter((item) => item.toLowerCase().includes(needle))
            : group.items;
          return (
            <section key={group.key} className={`resource-group ${expanded ? "open" : ""}`}>
              <button
                type="button"
                className="resource-summary"
                aria-expanded={expanded}
                onClick={() => setOpen(expanded ? "" : group.key)}
              >
                <Layers size={15} />
                <strong>{group.label}</strong>
                <small>{group.items.length}</small>
                <ChevronRight size={15} />
              </button>
              {expanded && (
                <ul>
                  {items.slice(0, 300).map((item) => (
                    <li key={item} className={inUse(item) ? "in-use" : ""}>
                      <span>{item}</span>
                      {inUse(item) && (
                        <em>{tr("utilisé")}</em>
                      )}
                    </li>
                  ))}
                  {items.length > 300 && (
                    <li className="more">
                      {tr("{0} autres fichiers…", [items.length - 300])}
                    </li>
                  )}
                </ul>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
