import { t as tr } from "./i18n";
import { useEffect, useRef, useState } from "react";
import { ChevronDown, Copy, Star, X } from "lucide-react";
import { Picture, shortName } from "./components";
import { modelPath } from "./modelNames";
import { readStored, writeStored } from "./sessionStorage";

type Description = {
  title?: string;
  baseModel?: string;
  version?: string;
  triggers?: string[];
};
const FAVORITES = "model-favorites-v1";
function readFavorites(): Record<string, string[]> {
  const value = readStored<Record<string, string[]>>(FAVORITES, {});
  return value && typeof value === "object" ? value : {};
}
function writeFavorites(kind: string, names: string[]) {
  writeStored(FAVORITES, { ...readFavorites(), [kind]: names });
}
/** ComfyUI publishes no model metadata, so the description stays empty. */
function useDescription(_kind: string, _name: string) {
  const [description] = useState<Description>({});
  return description;
}

export function StudioModel({
  name,
  onBrowse,
  refreshKey,
}: {
  name: string;
  onBrowse: () => void;
  refreshKey: number;
}) {
  const info = useDescription("checkpoints", name);
  const [favorite, setFavorite] = useState(false),
    [ready, setReady] = useState(false),
    [error, setError] = useState("");
  const pending = useRef(false),
    revision = useRef(0);
  useEffect(() => {
    setFavorite(readFavorites().checkpoints?.includes(name) === true);
    setError("");
    setReady(true);
    return () => {
      revision.current++;
    };
  }, [name, refreshKey]);
  function toggle() {
    if (!ready || pending.current) return;
    pending.current = true;
    const version = revision.current;
    const next = !favorite;
    const current = readFavorites().checkpoints ?? [];
    writeFavorites(
      "checkpoints",
      next ? [...current, name] : current.filter((n) => n !== name),
    );
    if (version === revision.current) setFavorite(next);
    if (!writeStored(FAVORITES, readFavorites())) {
      if (version === revision.current)
        setError(tr("Le favori n’a pas pu être enregistré."));
    }
    pending.current = false;
  }
  return (
    <section id="studio-model" tabIndex={-1}>
      <div className="studio-section-heading">
        <h2>{tr("Modèle")}</h2>
        <button className="inline-action" onClick={onBrowse}>
          {" "}
          {tr("Parcourir les modèles")}{" "}
        </button>
      </div>
      <div className="studio-model">
        <button
          className="model-select"
          onClick={onBrowse}
          aria-label={
            name
              ? tr("Changer de modèle : {0}", [shortName(name)])
              : tr("Choisir un modèle")
          }
        >
          <Picture path={modelPath("checkpoints", name)} alt="" thumbnail />
          <span>
            <strong>{name ? shortName(name) : tr("Choisir un modèle")}</strong>
            <small>
              Checkpoint{info.baseModel ? ` · ${info.baseModel}` : ""}
            </small>
          </span>
          <ChevronDown size={17} />
        </button>
        {name && (
          <button
            className="model-favorite"
            aria-pressed={favorite}
            disabled={!ready}
            onClick={() => toggle()}
          >
            <Star size={14} fill={favorite ? "currentColor" : "none"} />
            {favorite ? tr("Favori") : tr("Ajouter aux favoris")}
          </button>
        )}
      </div>
      {error && (
        <p role="alert" className="hint">
          {error}
        </p>
      )}
    </section>
  );
}

export function StudioLora({
  name,
  strength,
  index,
  onChange,
  onRemove,
  onTrigger,
}: {
  name: string;
  strength: number;
  index: number;
  onChange: (strength: number) => void;
  onRemove: () => void;
  onTrigger: (tag: string) => void;
}) {
  const info = useDescription("loras", name);
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);
  const previousStrength = useRef(1);
  if (Number.isFinite(strength) && strength !== 0)
    previousStrength.current = strength;
  return (
    <article className="studio-lora lora-row">
      <div className="lora-heading">
        <Picture path={modelPath("loras", name)} alt="" thumbnail />
        <span>
          <h3>{shortName(name)}</h3>
          <small>LoRA{info.baseModel ? ` · ${info.baseModel}` : ""}</small>
        </span>
        <input
          className="lora-toggle"
          type="checkbox"
          role="switch"
          aria-label={tr("Activer {0}", [shortName(name)])}
          checked={strength !== 0}
          onChange={(e) =>
            onChange(e.target.checked ? previousStrength.current : 0)
          }
        />
        <button
          className="icon-action"
          aria-label={tr("Retirer {0}", [shortName(name)])}
          onClick={onRemove}
        >
          <X size={15} />
        </button>
      </div>
      {!!info.triggers?.length && (
        <div className="lora-triggers">
          <small>{tr("Déclencheur")}</small>
          {info.triggers.map((tag) => (
            <button key={tag} onClick={() => onTrigger(tag)}>
              {tag} +
            </button>
          ))}
          <button
            className="icon-action"
            aria-label={tr("Copier les déclencheurs")}
            onClick={() => {
              setCopied(false);
              setCopyError(false);
              void navigator.clipboard
                .writeText(info.triggers!.join(", "))
                .then(() => setCopied(true))
                .catch(() => setCopyError(true));
            }}
          >
            <Copy size={12} />
          </button>
          {copied && <small role="status">{tr("Copié")}</small>}
          {copyError && <small role="alert">{tr("Copie indisponible")}</small>}
        </div>
      )}
      <div className="lora-strength">
        <span>{tr("Intensité")}</span>
        <input
          type="range"
          aria-label={tr("Intensité LoRA {0}", [index + 1])}
          min={-4}
          max={4}
          step={0.05}
          value={Number.isFinite(strength) ? strength : 0}
          onChange={(e) => onChange(Number(e.target.value))}
        />
        <input
          type="number"
          aria-label={tr("Poids LoRA {0}", [index + 1])}
          min={-4}
          max={4}
          step={0.05}
          value={Number.isFinite(strength) ? strength : ""}
          onChange={(e) =>
            onChange(e.target.value === "" ? NaN : Number(e.target.value))
          }
        />
      </div>
    </article>
  );
}
