import { t as tr } from "./i18n";
import { Sparkles, BookOpen, Heart, ArrowRight, Server } from "lucide-react";
import landscape from "../assets/welcome/yofJz.png";
import blossoms from "../assets/welcome/H9L7TJ.png";

export default function Welcome({
  onConnect,
  onExplore,
}: {
  onConnect: () => void;
  onExplore: () => void;
}) {
  return (
    <section className="onboarding" aria-label={tr("Bienvenue dans 绘画")}>
      <div
        className="onboarding-collage"
        aria-label={tr("Exemples d’inspiration")}
      >
        <img
          className="welcome-landscape"
          src={landscape}
          alt={tr("Forêt sous un ciel pastel")}
        />
        <img
          className="welcome-blossoms"
          src={blossoms}
          alt={tr("Branche fleurie")}
        />
        <span>
          <Server size={16} /> {tr("Imaginé ici. Généré sur votre serveur.")}{" "}
        </span>
      </div>
      <div>
        <span className="eyebrow">{tr("BIENVENUE DANS VOTRE ATELIER")}</span>
        <h2>
          {" "}
          {tr("De grandes idées.")} <br /> {tr("Au creux de la main.")}{" "}
        </h2>
        <p>
          {" "}
          {tr(
            "Le client ComfyUI le plus simple : indiquez l’adresse de votre serveur et créez depuis votre téléphone.",
          )}{" "}
        </p>
      </div>
      <div className="onboarding-features">
        <div>
          <Sparkles />
          <span>
            <strong>{tr("Créez sans limite")}</strong>
            <small>{tr("Modèles, LoRAs et workflows à portée de main.")}</small>
          </span>
        </div>
        <div>
          <BookOpen />
          <span>
            <strong>{tr("Trouvez les bons mots")}</strong>
            <small>{tr("Une garde-robe de tenues, poses et décors prêts à cliquer.")}</small>
          </span>
        </div>
        <div>
          <Heart />
          <span>
            <strong>{tr("Gardez vos coups de cœur")}</strong>
            <small>{tr("Toutes vos créations, dans votre galerie.")}</small>
          </span>
        </div>
      </div>
      <div className="onboarding-note">
        {" "}
        {tr(
          "Lancez ComfyUI sur votre ordinateur ou votre serveur, puis saisissez son adresse. Aucun logiciel intermédiaire n’est nécessaire.",
        )}{" "}
      </div>
      <div className="onboarding-actions">
        <button className="primary" onClick={onConnect}>
          {" "}
          {tr("Connecter un serveur ComfyUI")} <ArrowRight size={18} />
        </button>
        <button className="text-button" onClick={onExplore}>
          {" "}
          {tr("Découvrir la garde-robe d’abord")}{" "}
        </button>
      </div>
    </section>
  );
}
