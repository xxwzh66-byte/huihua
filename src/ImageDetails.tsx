import { t as tr } from "./i18n";
import { useEffect, useState } from "react";
import { Check, Copy, LoaderCircle, Pencil, Send, Undo2 } from "lucide-react";
import { Modal } from "./Modal";
import { importImage } from "./metadata";
import { dataUrlBytes } from "./imageBytes";
import { imageUrl } from "./api";

type Loaded = {
  source: string;
  warnings: string[];
  positive: string;
  negative: string;
  rows: [string, string][];
};

const shown = (value: unknown) =>
  value === undefined || value === null || value === "" ? "—" : String(value);

/**
 * Reads the metadata baked into the generated PNG/JPEG and lays it out.
 *
 * v1.18: the two prompt blocks are editable. Editing only changes the copy —
 * the file on disk is never rewritten — but it lets you tidy a prompt and then
 * either copy it or push it straight back into the Atelier.
 */
export default function ImageDetails({
  url,
  name,
  onApply,
  onClose,
}: {
  url: string;
  name: string;
  onApply?: (positive: string, negative: string) => void;
  onClose: () => void;
}) {
  const [data, setData] = useState<Loaded | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState("");
  const [positive, setPositive] = useState("");
  const [negative, setNegative] = useState("");
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const source = url || (await imageUrl(name));
        const parsed = await importImage(dataUrlBytes(source));
        if (!alive) return;
        const s = parsed.settings ?? {};
        const pos = String(s.positive ?? "").trim();
        const neg = String(s.negative ?? "").trim();
        setPositive(pos);
        setNegative(neg);
        setData({
          source: parsed.source,
          warnings: parsed.warnings,
          positive: pos,
          negative: neg,
          rows: [
            [tr("Modèle"), shown(s.model)],
            [tr("Taille"), s.width && s.height ? `${s.width} × ${s.height}` : "—"],
            [tr("Étapes"), shown(s.steps)],
            ["CFG", shown(s.cfg)],
            [tr("Sampler"), shown(s.sampler)],
            [tr("Scheduler"), shown(s.scheduler)],
            [tr("Graîne"), shown(s.seed)],
            [
              tr("LoRAs"),
              (s.loras ?? []).length
                ? (s.loras ?? [])
                    .map((l) => `${l.name} ${l.strength}`)
                    .join("\n")
                : "—",
            ],
            [tr("VAE"), shown(s.vae)],
            [tr("Source"), parsed.source],
          ],
        });
      } catch (caught) {
        if (alive)
          setError(
            tr("Impossible de lire les métadonnées de cette image.") +
              (caught instanceof Error ? ` ${caught.message}` : ""),
          );
      }
    })();
    return () => {
      alive = false;
    };
  }, [url, name]);

  const dirty =
    !!data && (positive !== data.positive || negative !== data.negative);

  async function copy(text: string, tag: string) {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(tag);
      window.setTimeout(() => setCopied(""), 1600);
    } catch {
      setError(tr("La copie automatique est indisponible sur cet appareil."));
    }
  }

  /** Everything at once: both prompts plus the parameters, as plain text. */
  function whole() {
    if (!data) return "";
    const lines = [
      `${tr("Prompt positif")}: ${positive || "—"}`,
      `${tr("Prompt négatif")}: ${negative || "—"}`,
    ];
    for (const [label, value] of data.rows) lines.push(`${label}: ${value}`);
    return lines.join("\n");
  }

  return (
    <Modal title={tr("Prompt détaillé")} className="image-details" onClose={onClose}>
      {error && (
        <p className="detail-error" role="alert">
          {error}
        </p>
      )}
      {!data && !error && (
        <p className="detail-loading" role="status">
          <LoaderCircle className="spin" size={18} />{" "}
          {tr("Lecture des métadonnées…")}
        </p>
      )}
      {data && (
        <>
          {data.positive ? (
            <section className="detail-block">
              <div className="detail-block-head">
                <h3>{tr("Prompt positif")}</h3>
                <button
                  className="studio-link"
                  onClick={() => void copy(positive, "positive")}
                >
                  {copied === "positive" ? <Check size={14} /> : <Copy size={14} />}
                  {copied === "positive" ? tr("Copié") : tr("Copier")}
                </button>
              </div>
              {editing ? (
                <textarea
                  className="detail-edit"
                  aria-label={tr("Prompt positif")}
                  value={positive}
                  rows={6}
                  onChange={(e) => setPositive(e.target.value)}
                />
              ) : (
                <pre className="detail-text">{positive || "—"}</pre>
              )}
            </section>
          ) : (
            <p className="detail-empty">{tr("Aucun prompt positif dans cette image.")}</p>
          )}
          {data.negative && (
            <section className="detail-block">
              <div className="detail-block-head">
                <h3>{tr("Prompt négatif")}</h3>
                <button
                  className="studio-link"
                  onClick={() => void copy(negative, "negative")}
                >
                  {copied === "negative" ? <Check size={14} /> : <Copy size={14} />}
                  {copied === "negative" ? tr("Copié") : tr("Copier")}
                </button>
              </div>
              {editing ? (
                <textarea
                  className="detail-edit"
                  aria-label={tr("Prompt négatif")}
                  value={negative}
                  rows={4}
                  onChange={(e) => setNegative(e.target.value)}
                />
              ) : (
                <pre className="detail-text">{negative || "—"}</pre>
              )}
            </section>
          )}
          <dl className="detail-rows">
            {data.rows.map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
          {data.warnings.length > 0 && (
            <ul className="detail-warnings">
              {data.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          )}
          <div className="detail-actions">
            <button
              className={editing ? "primary" : ""}
              onClick={() => setEditing((on) => !on)}
            >
              {editing ? <Check size={15} /> : <Pencil size={15} />}
              {editing ? tr("Fin de l’édition") : tr("Modifier")}
            </button>
            {dirty && (
              <button
                onClick={() => {
                  setPositive(data.positive);
                  setNegative(data.negative);
                }}
              >
                <Undo2 size={15} />
                {tr("Rétablir")}
              </button>
            )}
            <button onClick={() => void copy(whole(), "all")}>
              {copied === "all" ? <Check size={15} /> : <Copy size={15} />}
              {copied === "all" ? tr("Copié") : tr("Copier tout")}
            </button>
            {onApply && (
              <button
                className="primary"
                disabled={!positive && !negative}
                onClick={() => {
                  onApply(positive, negative);
                  onClose();
                }}
              >
                <Send size={15} />
                {tr("Envoyer à l’atelier")}
              </button>
            )}
          </div>
          {editing && (
            <p className="detail-hint">{tr("修改只影响这里的复制内容，不会改写图片文件。")}</p>
          )}
        </>
      )}
    </Modal>
  );
}
