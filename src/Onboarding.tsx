import { useEffect, useRef } from "react";
import { t } from "./i18n";
import LanguagePicker from "./LanguagePicker";
import { LockSettings } from "./AppLock";
import mascot from "../assets/brand/expressions/open.webp";
import {
  ArrowLeft,
  ArrowRight,
  Server,
  Sparkles,
  Images,
  BookOpen,
} from "lucide-react";
import "./Onboarding.css";
export default function Onboarding({
  step,
  onStep,
  onLater,
  onFinish,
  onConnect,
  online,
  leftHanded,
  onHandedness,
  quickMenu,
  onQuickMenu,
}: {
  step: number;
  onStep: (n: number) => void;
  onLater: () => void;
  onFinish: () => void;
  onConnect: () => void;
  online: boolean;
  leftHanded: boolean;
  onHandedness: (v: boolean) => void;
  quickMenu: boolean;
  onQuickMenu: (v: boolean) => void;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
    window.scrollTo(0, 0);
  }, [step]);
  const titles = [
    t("Bienvenue dans 绘画"),
    t("ComfyUI fait la magie"),
    t("Un atelier à votre main"),
    t("Votre espace privé"),
    t("Votre première création"),
  ];
  return (
    <main className="first-run">
      <header className="first-run-top">
        <span>绘画</span>
        <button onClick={onLater}>{t("Plus tard")}</button>
      </header>
      <img className="first-run-mochi" src={mascot} alt="" />
      <p className="eyebrow">
        {t("PREMIERS PAS")} · {step + 1} / 5
      </p>
      <h1 ref={heading} tabIndex={-1}>
        {titles[step]}
      </h1>
      <div className="first-run-dots" aria-hidden="true">
        {titles.map((title, i) => (
          <span key={title} className={i === step ? "current" : ""} />
        ))}
      </div>
      {step === 0 && (
        <>
          <p>
            {t(
              "Imaginez sur votre téléphone. Générez sur votre serveur ComfyUI. Retrouvez toutes vos créations dans un atelier à emporter.",
            )}
          </p>
          <LanguagePicker />
          <div className="first-run-note">
            {t(
              "绘画 se connecte directement à votre serveur ComfyUI. Aucun logiciel intermédiaire n’est nécessaire, mais le serveur doit rester allumé pendant la génération.",
            )}
          </div>
        </>
      )}
      {step === 1 && (
        <>
          <ol className="first-run-list">
            <li>
              {t("Lancez ComfyUI et notez l’adresse et le port affichés au démarrage.")}
            </li>
            <li>
              {t(
                "Vérifiez que le téléphone joint le serveur : http://192.168.x.x:8188 sur le réseau local, https en dehors.",
              )}
            </li>
            <li>
              {t("Ouvrez ensuite les Paramètres ici, saisissez cette adresse et connectez-vous.")}
            </li>
          </ol>
          <button className="primary" onClick={onConnect}>
            <Server size={20} />
            {online ? t("Gérer le serveur") : t("Connecter un serveur ComfyUI")}
          </button>
          <p role="status">
            {online
              ? t("Votre serveur est connecté.")
              : t("Aucun serveur connecté pour le moment. Vous pouvez continuer et le connecter plus tard.")}
          </p>
          <details>
            <summary>{t("Si la connexion échoue")}</summary>
            <p>
              {t(
                "Vérifiez que l’adresse contient http:// ou https:// ainsi que le port, que le pare-feu du serveur l’autorise, et que la page s’ouvre depuis le navigateur du téléphone.",
              )}
            </p>
          </details>
        </>
      )}
      {step === 2 && (
        <>
          <p>
            {t("Choisissez où placer vos raccourcis. Ces préférences restent modifiables dans les paramètres.")}
          </p>
          <label className="switch-row">
            <span>{t("Menu rapide de l’atelier")}</span>
            <input
              type="checkbox"
              role="switch"
              checked={quickMenu}
              onChange={(e) => onQuickMenu(e.target.checked)}
            />
          </label>
          <label className="switch-row">
            <span>{t("Mode gaucher")}</span>
            <input
              type="checkbox"
              role="switch"
              checked={leftHanded}
              onChange={(e) => onHandedness(e.target.checked)}
            />
          </label>
          <div className="first-run-note">
            {t("Les raccourcis se superposent au bord de l’écran. Le bouton génération vous ramène directement au résultat.")}
          </div>
        </>
      )}
      {step === 3 && (
        <>
          <p>
            {t("Protégez l’accès à 绘画 avec la biométrie de votre téléphone. Vous choisissez le délai de verrouillage après une absence.")}
          </p>
          <LockSettings />
          <div className="first-run-note">
            {t("Les images restent sur votre serveur. Les captures d’écran sont autorisées. Si la biométrie est indisponible, vous pouvez continuer sans l’activer.")}
          </div>
        </>
      )}
      {step === 4 && (
        <>
          <div className="first-run-feature">
            <Sparkles />
            <div>
              <h2>{t("Atelier")}</h2>
              <p>
                {t("Choisissez un modèle, ajoutez vos LoRAs et décrivez votre image. Les suggestions de tags, la traduction, les blocs et l’historique vous aident à écrire.")}
              </p>
            </div>
          </div>
          <div className="first-run-feature">
            <Images />
            <div>
              <h2>{t("Galerie")}</h2>
              <p>
                {t("Glissez verticalement entre les images. Glissez horizontalement pour favoriser ou masquer. Un appui long active la sélection multiple.")}
              </p>
            </div>
          </div>
          <div className="first-run-feature">
            <BookOpen />
            <div>
              <h2>{t("Glossaire")}</h2>
              <p>
                {t("Explorez les tags par thème. Enregistrez vos réglages dans des presets pour retrouver votre style.")}
              </p>
            </div>
          </div>
        </>
      )}
      <footer className="first-run-actions">
        {step > 0 && (
          <button onClick={() => onStep(step - 1)}>
            <ArrowLeft size={18} />
            {t("Retour")}
          </button>
        )}
        <button
          className="primary"
          onClick={() => (step === 4 ? onFinish() : onStep(step + 1))}
        >
          {step === 4 ? t("Ouvrir mon atelier") : t("Continuer")}
          <ArrowRight size={18} />
        </button>
      </footer>
    </main>
  );
}
