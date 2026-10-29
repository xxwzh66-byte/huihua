import { UpdateSettings } from "./AppUpdater";
import "./settings-hub.css";
import LanguagePicker from "./LanguagePicker";
import { t as tr, locale } from "./i18n";
import { useEffect, useRef, useState } from "react";
import {
  Server,
  Link,
  ShieldCheck,
  Unplug,
  ChevronRight,
  Layers,
  Workflow,
  Bookmark,
  Palette,
  Download,
  Cpu,
  MemoryStick,
  Sparkles,
} from "lucide-react";
import { type ObjectInfo, type Queue, type Stats, type Workflow as Graph } from "./api";
import { version } from "../package.json";
import { LockSettings } from "./AppLock";
import LlmSettings from "./LlmSettings";
import ServerResources from "./ServerResources";

type Props = {
  quickMenu: boolean;
  onQuickMenu: (value: boolean) => void;
  leftHanded: boolean;
  onHandedness: (value: boolean) => void;
  server: string;
  busy: boolean;
  active: boolean;
  onConnect: (url: string) => Promise<void>;
  onDisconnect: (alreadyDisconnected?: boolean) => Promise<void>;
  onError: (error: string) => void;
  stats: Stats | null;
  queue: Queue;
  online: boolean;
  info: ObjectInfo | null;
  workflow: Graph | null;
  onOpen: (target: "models" | "workflow" | "presets") => void;
  onMessage: (text: string) => void;
};

const memory = (value?: number) =>
  typeof value === "number" && Number.isFinite(value) && value >= 0
    ? tr("{0} Go", [
        (value / 1024 ** 3).toLocaleString(locale(), {
          maximumFractionDigits: 1,
        }),
      ])
    : tr("Indisponible");

export default function Connections({
  quickMenu,
  onQuickMenu,
  leftHanded,
  onHandedness,
  server,
  busy,
  onConnect,
  onDisconnect,
  onError,
  stats,
  queue,
  online,
  info,
  workflow,
  onOpen,
  onMessage,
}: Props) {
  const [address, setAddress] = useState(server);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const mounted = useRef(true);
  const disabled = busy || working;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => setAddress(server), [server]);

  const submit = async () => {
    if (disabled) return;
    const text = address.trim();
    if (!text) {
      setError(tr("Indiquez l’adresse de votre serveur ComfyUI."));
      return;
    }
    setWorking(true);
    setError("");
    try {
      await onConnect(text);
      if (mounted.current) setError("");
    } catch (e) {
      if (mounted.current) {
        setError(String(e));
        onError(String(e));
      }
    } finally {
      if (mounted.current) setWorking(false);
    }
  };

  const device = stats?.devices?.[0];
  const deviceName = (device?.name ?? tr("GPU du serveur"))
    .replace(/^cuda:\d+\s*/, "")
    .replace(/\s*:\s*cudaMallocAsync.*$/, "")
    .replace(/^NVIDIA GeForce\s+/, "");

  return (
    <div className="settings-hub">
      <section className="panel connection-form">
        <div className="section-heading">
          <h2>{server ? tr("Serveur ComfyUI") : tr("Connexion au serveur")}</h2>
          {server && (
            <span className="connection-state" role="status">
              <span className={`dot ${online ? "online" : ""}`} />
              {online ? tr("Connecté") : tr("Serveur indisponible")}
            </span>
          )}
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <label>
            {tr("Adresse du serveur ComfyUI")}
            <input
              type="url"
              inputMode="url"
              value={address}
              maxLength={2048}
              placeholder="http://192.168.1.8:8188"
              autoCapitalize="none"
              autoComplete="off"
              spellCheck={false}
              disabled={disabled}
              onChange={(e) => {
                setAddress(e.target.value);
                setError("");
              }}
            />
          </label>
          <p className="hint">
            <ShieldCheck size={16} />
            {tr(
              "Indiquez l’adresse exacte affichée par ComfyUI au démarrage, par exemple http://127.0.0.1:8188 ou https://mon-serveur.example.com.",
            )}
          </p>
          {error && <p role="alert">{error}</p>}
          <div className="row">
            <button type="submit" className="primary" disabled={disabled}>
              <Link size={17} />
              {working
                ? tr("Connexion…")
                : server
                  ? tr("Reconnecter")
                  : tr("Connecter le serveur")}
            </button>
            {server && (
              <button
                type="button"
                disabled={disabled}
                onClick={() =>
                  void (async () => {
                    setWorking(true);
                    try {
                      await onDisconnect();
                      if (mounted.current) setAddress("");
                    } finally {
                      if (mounted.current) setWorking(false);
                    }
                  })()
                }
              >
                <Unplug size={17} /> {tr("Déconnecter")}
              </button>
            )}
          </div>
        </form>
      </section>

      {server && (
        <section className="panel">
          <h2>{tr("Serveur actif")}</h2>
          <dl className="connection-details">
            <div>
              <dt>{tr("Adresse")}</dt>
              <dd>{server}</dd>
            </div>
            <div>
              <dt>{tr("GPU")}</dt>
              <dd>{deviceName}</dd>
            </div>
            <div>
              <dt>{tr("VRAM disponible")}</dt>
              <dd>
                {memory(device?.vram_free)} / {memory(device?.vram_total)}
              </dd>
            </div>
            <div>
              <dt>{tr("RAM disponible")}</dt>
              <dd>
                {memory(stats?.system?.ram_free)} /{" "}
                {memory(stats?.system?.ram_total)}
              </dd>
            </div>
            <div>
              <dt>{tr("File d’attente")}</dt>
              <dd>
                {queue.queue_running.length} · {queue.queue_pending.length}
              </dd>
            </div>
          </dl>
          <p className="hint">
            <Cpu size={15} /> {tr("État vérifié sur {0}", [server])}{" "}
            <MemoryStick size={15} />
          </p>
        </section>
      )}

      <details className="settings-group">
        <summary>
          <Layers />
          <span>
            <strong>{tr("Atelier")}</strong>
            <small>{tr("Raccourcis, bibliothèque et génération")}</small>
          </span>
          <ChevronRight />
        </summary>
        <div className="settings-group-content">
          <section className="settings-menu">
            <label className="switch-row handedness-setting">
              <span>
                <strong>{tr("Menu rapide de l’Atelier")}</strong>
                <small>{tr("Accès aux sections et à la génération")}</small>
              </span>
              <input
                type="checkbox"
                role="switch"
                aria-label={tr("Menu rapide de l’Atelier")}
                checked={quickMenu}
                onChange={(e) => onQuickMenu(e.target.checked)}
              />
            </label>
            <label className="switch-row handedness-setting">
              <span>
                <strong>{tr("Mode gaucher")}</strong>
                <small>
                  {tr("Placer les raccourcis de l’Atelier à gauche")}
                </small>
              </span>
              <input
                type="checkbox"
                role="switch"
                aria-label={tr("Mode gaucher")}
                checked={leftHanded}
                onChange={(e) => onHandedness(e.target.checked)}
              />
            </label>
            <button disabled={!server} onClick={() => onOpen("models")}>
              <Layers />
              <span>
                <strong>{tr("Modèles, LoRAs & upscalers")}</strong>
                <small>{tr("Retrouver les ressources de votre serveur")}</small>
              </span>
              <ChevronRight />
            </button>
            <button disabled={!server} onClick={() => onOpen("workflow")}>
              <Workflow />
              <span>
                <strong>{tr("Workflows ComfyUI")}</strong>
                <small>{tr("Importer et adapter un workflow API")}</small>
              </span>
              <ChevronRight />
            </button>
            <button disabled={!server} onClick={() => onOpen("presets")}>
              <Bookmark />
              <span>
                <strong>{tr("Mes presets")}</strong>
                <small>
                  {tr("Enregistrer et réutiliser une configuration")}
                </small>
              </span>
              <ChevronRight />
            </button>
          </section>
        </div>
      </details>

      <details className="settings-group">
        <summary>
          <Sparkles />
          <span>
            <strong>{tr("API de génération")}</strong>
            <small>{tr("Assistant de prompt et modèles skill")}</small>
          </span>
          <ChevronRight />
        </summary>
        <div className="settings-group-content">
          <LlmSettings onMessage={onMessage} onError={onError} />
        </div>
      </details>

      <details className="settings-group">
        <summary>
          <Cpu />
          <span>
            <strong>{tr("Ressources du serveur")}</strong>
            <small>{tr("Modèles, encodeurs et VAE disponibles")}</small>
          </span>
          <ChevronRight />
        </summary>
        <div className="settings-group-content">
          {info ? (
            <ServerResources info={info} workflow={workflow} />
          ) : (
            <p className="resources-empty">
              {tr("Connectez un serveur ComfyUI pour lire ses ressources.")}
            </p>
          )}
        </div>
      </details>

      <details className="settings-group">
        <summary>
          <ShieldCheck />
          <span>
            <strong>{tr("Sécurité")}</strong>
            <small>{tr("Biométrie et confidentialité")}</small>
          </span>
          <ChevronRight />
        </summary>
        <div className="settings-group-content">
          <LockSettings />
        </div>
      </details>

      <details className="settings-group">
        <summary>
          <Palette />
          <span>
            <strong>{tr("Application")}</strong>
            <small>{tr("Langue, apparence et mises à jour")}</small>
          </span>
          <ChevronRight />
        </summary>
        <div className="settings-group-content">
          <section className="settings-menu">
            <LanguagePicker />
            <div className="setting-row">
              <Palette />
              <span>
                <strong>{tr("Apparence")}</strong>
                <small>{tr("Blanc pur · Clair")}</small>
              </span>
            </div>
            <div className="setting-row">
              <Download />
              <span>
                <strong>{tr("Téléchargements")}</strong>
                <small>Pictures / 绘画</small>
              </span>
            </div>
          </section>
          <UpdateSettings />
          <button
            className="setup-mobile-resume"
            onClick={() => window.dispatchEvent(new Event("paint-setup"))}
          >
            {tr("Refaire la configuration")}
          </button>
        </div>
      </details>

      <div className="settings-version">
        <span>
          <Server size={14} /> 绘画
        </span>
        <span>Version {version}</span>
      </div>
    </div>
  );
}
