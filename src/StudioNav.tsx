import { t as tr } from "./i18n";
import { useEffect, useRef, useState } from "react";
import { Sparkles, Bookmark, MessageSquare, SlidersHorizontal, Image } from "lucide-react";

/*
 * v1.22: the quick nav used to list six anchors, but three of them
 * (`studio-model`, `studio-loras`, `studio-generation`) have not existed in
 * the tree since the studio was folded into cards — those buttons scrolled
 * nowhere. It now lists the three sections the page actually has, and the
 * `essential` flag replaces the old hard-coded index filter so a collapsed
 * (workflow present) studio still gets a short, honest list.
 */
const sections = [
  { id: "studio-configuration", label: "Configuration", Icon: Bookmark, essential: true },
  { id: "studio-workflow", label: "Workflow", Icon: SlidersHorizontal, essential: false },
  { id: "studio-prompts", label: "Prompts", Icon: MessageSquare, essential: true },
  { id: "studio-render", label: "Rendu", Icon: Image, essential: true },
];

export default function StudioNav({
  active,
  workflow,
  leftHanded,
  onGenerate,
  generating,
}: {
  onGenerate: () => void;
  generating: boolean;
  active: boolean;
  workflow: boolean;
  leftHanded: boolean;
}) {
  const visible = workflow ? sections.filter((section) => section.essential) : sections;
  const [current, setCurrent] = useState(visible[0].id);
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!active) return;
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const edge = 40;
        let next = visible[0].id;
        for (const { id } of visible) {
          const element = document.getElementById(id);
          if (element && element.getBoundingClientRect().top <= edge) next = id;
        }
        if (
          innerWidth < 900 &&
          scrollY > 0 &&
          innerHeight + scrollY >= document.documentElement.scrollHeight - 4
        )
          next = "studio-render";
        setCurrent(next);
      });
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
    // `visible` is derived from `workflow`; listing its members keeps the
    // effect stable across renders where the array is rebuilt.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, workflow]);
  return (
    <nav
      ref={ref}
      className={`studio-quick-nav ${leftHanded ? "on-left" : "on-right"}`}
      aria-label={tr("Sections de l’Atelier")}
    >
      {visible.map(({ id, label, Icon }) => (
        <button
          key={id}
          aria-label={tr("Aller à {0}", [label])}
          title={tr(label)}
          aria-current={current === id ? "location" : undefined}
          onClick={() => {
            const target = document.getElementById(id);
            if (!target) return;
            window.scrollTo({
              top: window.scrollY + target.getBoundingClientRect().top - 24,
              behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
                ? "instant"
                : "smooth",
            });
            target.focus({ preventScroll: true });
          }}
        >
          <Icon size={15} />
          <span className="quick-nav-tooltip">{tr(label)}</span>
        </button>
      ))}
      <button
        className="quick-generate"
        aria-label={tr("Générer depuis le menu rapide")}
        title={tr("Générer l’image")}
        disabled={generating}
        onClick={onGenerate}
      >
        <Sparkles size={17} />
      </button>
    </nav>
  );
}
