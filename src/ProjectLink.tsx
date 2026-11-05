import { useEffect, useRef, useState } from "react";
import { native } from "./api";
import { t } from "./i18n";
import { REPO_URL } from "./project";

/**
 * Opens the project page outside the WebView.
 *
 * An <a target="_blank"> inside the Tauri shell would either be swallowed by
 * the WebView or bounce back into the app, so the tap goes through the Rust
 * `open_link` command, which hands the URL to the system browser.
 */
export default function ProjectLink() {
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const timer = useRef(0);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  async function open() {
    setError("");
    try {
      await native("open_link", { url: REPO_URL });
    } catch (e) {
      // Desktop builds have no browser bridge, so fall back to the clipboard
      // and tell the user where the address went.
      try {
        await navigator.clipboard.writeText(REPO_URL);
        setCopied(true);
        timer.current = window.setTimeout(() => setCopied(false), 2600);
      } catch {
        setError(e instanceof Error ? e.message : String(e));
      }
    }
  }

  return (
    <div className="project-link">
      <button type="button" className="setting-row" onClick={() => void open()}>
        <svg
          viewBox="0 0 24 24"
          width="18"
          height="18"
          fill="currentColor"
          aria-hidden="true"
        >
          <path d="M12 .5A11.5 11.5 0 0 0 .5 12a11.5 11.5 0 0 0 7.86 10.92c.58.1.79-.25.79-.55v-1.94c-3.2.7-3.88-1.54-3.88-1.54-.53-1.34-1.29-1.7-1.29-1.7-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.7 0-1.26.45-2.29 1.19-3.1-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.18 1.18a11 11 0 0 1 5.79 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.12 3.05.74.81 1.18 1.84 1.18 3.1 0 4.43-2.69 5.4-5.25 5.69.41.36.78 1.06.78 2.14v3.17c0 .31.21.66.8.55A11.5 11.5 0 0 0 23.5 12A11.5 11.5 0 0 0 12 .5Z" />
        </svg>
        <span>
          <strong>{t("Projet sur GitHub")}</strong>
          <small>
            {copied
              ? t("Adresse copiée dans le presse-papiers.")
              : error || t("Ouvrir le dépôt dans le navigateur")}
          </small>
        </span>
        <span className="project-link-open">{t("Ouvrir")}</span>
      </button>
    </div>
  );
}
