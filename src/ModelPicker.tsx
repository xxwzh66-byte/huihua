import { useEffect, useState } from "react";
import { t as tr } from "./i18n";
import { Picture, shortName } from "./components";
import { modelPath } from "./modelNames";
import { modelMetadata } from "./modelMetadata";
import { compatibleModel } from "./modelCompatibility";
import { Modal } from "./Modal";
import { readStored, writeStored } from "./sessionStorage";

const FAVORITES = "model-favorites-v1";
const favorites = (kind: string) => readStored<Record<string, string[]>>(FAVORITES, {})[kind] ?? [];

export default function ModelPicker({
  title,
  kind,
  names,
  value,
  onSelect,
  onClose,
  onTriggers,
  checkpoint,
}: {
  title: string;
  kind: "checkpoints" | "loras";
  names: string[];
  value: string;
  onSelect: (name: string) => void;
  onClose: () => void;
  onTriggers?: (words: string[]) => void;
  checkpoint?: string;
}) {
  const [search, setSearch] = useState("");
  const [onlyFavorites, setOnlyFavorites] = useState(false);
  const [onlyCompatible, setOnlyCompatible] = useState(false);
  const [limit, setLimit] = useState(40);
  const [starred, setStarred] = useState<string[]>(() => favorites(kind));
  const [metadata, setMetadata] = useState<Record<string, string>>({});
  const [checking, setChecking] = useState(kind === "loras" && !!checkpoint);
  useEffect(() => {
    if (kind !== "loras" || !checkpoint) return;
    let live = true;
    setChecking(true);
    void modelMetadata("loras", names, () => live)
      .then((data) => {
        if (live) setMetadata(data);
      })
      .catch(() => {})
      .finally(() => {
        if (live) setChecking(false);
      });
    return () => {
      live = false;
    };
  }, [kind, checkpoint, names]);
  const query = search.trim().toLowerCase();
  const filtered = names.filter((name) => {
    if (query && !shortName(name).toLowerCase().includes(query)) return false;
    if (onlyFavorites && !starred.includes(name)) return false;
    if (
      onlyCompatible &&
      checkpoint &&
      metadata[name] &&
      !compatibleModel(checkpoint, metadata[name])
    )
      return false;
    return true;
  });
  const toggle = (name: string) => {
    const next = starred.includes(name)
      ? starred.filter((n) => n !== name)
      : [...starred, name];
    setStarred(next);
    writeStored(FAVORITES, {
      ...readStored<Record<string, string[]>>(FAVORITES, {}),
      [kind]: next,
    });
  };
  return (
    <Modal title={title} className="model-picker" onClose={onClose}>
      <label className="search-box">
        <input
          aria-label={tr("Rechercher un modèle")}
          placeholder={tr("Rechercher un modèle…")}
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setLimit(40);
          }}
        />
      </label>
      <div className="model-filters">
        <button
          aria-pressed={onlyFavorites}
          onClick={() => setOnlyFavorites((v) => !v)}
        >
          {tr("Favoris")} ({starred.length})
        </button>
        {kind === "loras" && checkpoint && (
          <button
            aria-pressed={onlyCompatible}
            onClick={() => setOnlyCompatible((v) => !v)}
          >
            {checking
              ? tr("Vérification des modèles de base…")
              : tr("LoRA compatibles avec {0}", [shortName(checkpoint)])}
          </button>
        )}
      </div>
      <p className="hint">
        {tr("{0} disponibles", [filtered.length])} · {shortName(kind)}
      </p>
      <div className="model-list">
        {filtered.slice(0, limit).map((name) => (
          <div
            key={name}
            className={`model-row${value === name ? " selected" : ""}`}
          >
            <button className="model-open" onClick={() => onSelect(name)}>
              <Picture path={modelPath(kind, name)} alt="" thumbnail />
              <span>
                <strong>{shortName(name)}</strong>
                <small>{name}</small>
              </span>
            </button>
            <button
              className="model-star"
              aria-pressed={starred.includes(name)}
              aria-label={tr("Favori {0}", [shortName(name)])}
              onClick={() => toggle(name)}
            >
              ★
            </button>
          </div>
        ))}
        {!filtered.length && (
          <p>{tr("Aucun modèle ne correspond à cette recherche.")}</p>
        )}
      </div>
      {filtered.length > limit && (
        <button className="load-more" onClick={() => setLimit((v) => v + 40)}>
          {tr("Afficher la suite")}
        </button>
      )}
      {onTriggers && kind === "loras" && value && (
        <button className="primary" onClick={() => onTriggers([value])}>
          {tr("Ajouter ce LoRA")}
        </button>
      )}
    </Modal>
  );
}
