import { t as tr } from "./i18n";
import { useEffect, useState } from "react";
import { Copy, Check, LoaderCircle } from "lucide-react";
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

/** Reads the metadata baked into the generated PNG/JPEG and lays it out. */
export default function ImageDetails({
  url,
  name,
  onClose,
}: {
  url: string;
  name: string;
  onClose: () => void;
}) {
  const [data, setData] = useState<Loaded | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState("");

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const source = url || (await imageUrl(name));
        const parsed = await importImage(dataUrlBytes(source));
        if (!alive) return;
        const s = parsed.settings ?? {};
        setData({
          source: parsed.source,
          warnings: parsed.warnings,
          positive: String(s.positive ?? "").trim(),
          negative: String(s.negative ?? "").trim(),
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
                  onClick={() => void copy(data.positive, "positive")}
                >
                  {copied === "positive" ? <Check size={14} /> : <Copy size={14} />}
                  {copied === "positive" ? tr("Copié") : tr("Copier")}
                </button>
              </div>
              <pre className="detail-text">{data.positive}</pre>
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
                  onClick={() => void copy(data.negative, "negative")}
                >
                  {copied === "negative" ? <Check size={14} /> : <Copy size={14} />}
                  {copied === "negative" ? tr("Copié") : tr("Copier")}
                </button>
              </div>
              <pre className="detail-text">{data.negative}</pre>
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
        </>
      )}
    </Modal>
  );
}
