import { t as tr } from "./i18n";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import {
  Search,
  Plus,
  Minus,
  Check,
  X,
  ChevronRight,
  UserRound,
  Sparkles,
  Shirt,
  Mountain,
  Send,
} from "lucide-react";
import { normalizeSearch } from "./taxonomy";
import wardrobe from "./data/wardrobe.json";
import {
  describeSet,
  describeTag,
  groupLabel,
  sceneDraft,
} from "./wardrobeNames";

type Item = { label: string; tags: string[] };
type Group = { name: string; items: Item[] };
type Section = { id: string; name: string; groups: Group[]; tags: number };

const sections = wardrobe.sections as Section[];

/**
 * The chosen sets carry both readings: `zh` is what the panel prints, `label`
 * is the English set name the prompt page needs. Nothing user-facing renders
 * a raw underscore tag any more — every chip goes through `describeTag`.
 */
type Hit = {
  label: string;
  zh: string;
  tags: string[];
  zhTags: string[];
  context: string;
};

/** Group names keep their Chinese head; the Latin gloss stays for orientation. */
const breadcrumbGroup = (name: string) =>
  /（[A-Za-z]/.test(name) && /[\u4e00-\u9fa5]/.test(name) ? name : groupLabel(name);

const ICONS: Record<string, typeof Shirt> = {
  clothing: Shirt,
  scene: Mountain,
  pose: UserRound,
  expression: Sparkles,
};

const DETAILS: Record<string, string> = {
  clothing: "Tenues, matières et accessoires",
  scene: "Lieux, moments et atmosphères",
  pose: "Attitudes, gestes et compositions",
  expression: "Visages, intensités et réactions",
};

function Wardrobe({
  onAdd,
  onNotice,
  onDescribe,
}: {
  onAdd: (tags: string[], side: "positive" | "negative") => void;
  onNotice: (message: string) => void;
  onDescribe?: (text: string, prompt: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [section, setSection] = useState("clothing");
  const [group, setGroup] = useState("");
  const [limit, setLimit] = useState(40);
  const [selected, setSelected] = useState<string[]>([]);
  // v1.16: the picked items themselves, so a scene description can be built.
  const [chosen, setChosen] = useState<Hit[]>([]);
  const searchRef = useRef<HTMLInputElement>(null);
  const groupRef = useRef<HTMLDivElement>(null);

  const active = sections.find((s) => s.id === section) ?? sections[0];
  const groups = active?.groups ?? [];
  const current = groups.find((g) => g.name === group) ?? groups[0];

  useEffect(() => {
    setGroup("");
    setLimit(40);
  }, [section]);

  useEffect(() => {
    const list = groupRef.current;
    const choice = list?.querySelector<HTMLElement>('[aria-pressed="true"]');
    if (list && choice)
      list.scrollLeft +=
        choice.getBoundingClientRect().left -
        list.getBoundingClientRect().left -
        (list.clientWidth - choice.clientWidth) / 2;
  }, [section, group, query]);

  const hitFor = (item: Item, context: string): Hit => {
    const zhTags = item.tags.map(describeTag);
    return {
      label: item.label,
      zh: describeSet(item.label),
      tags: item.tags,
      zhTags,
      context,
    };
  };

  const hits = useMemo<Hit[]>(() => {
    const q = normalizeSearch(query);
    if (q) {
      // A search box that only knows English would make the Chinese reading
      // pointless: match the shelf, group, set, English tag and Chinese reading
      // in one pass, then deduplicate by the tag set that actually gets sent.
      const seen = new Set<string>();
      return sections
        .flatMap((s) =>
          s.groups.flatMap((g) =>
            g.items
              .filter((item) => {
                const haystack = normalizeSearch(
                  `${s.name} ${g.name} ${item.label} ${describeSet(item.label)} ${item.tags.join(" ")} ${item.tags.map(describeTag).join(" ")}`,
                );
                return haystack.includes(q);
              })
              .map((item) => hitFor(item, `${s.name} · ${breadcrumbGroup(g.name)}`)),
          ),
        )
        .filter((hit) => {
          const key = hit.tags.join("|");
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
    }
    return (current?.items ?? []).map((item) => hitFor(item, ""));
  }, [query, current]);

  const total = useMemo(
    () => sections.reduce((sum, s) => sum + s.tags, 0),
    [],
  );

  const toggle = (hit: Hit) =>
    setSelected((old) => {
      const on = hit.tags.every((tag) => old.includes(tag));
      setChosen((picked) =>
        on
          ? picked.filter((item) => item.tags.join("|") !== hit.tags.join("|"))
          : picked.some((item) => item.tags.join("|") === hit.tags.join("|"))
            ? picked
            : [...picked, hit],
      );
      return on
        ? old.filter((tag) => !hit.tags.includes(tag))
        : [...old, ...hit.tags.filter((tag) => !old.includes(tag))];
    });

  const add = (side: "positive" | "negative") => {
    onAdd(selected, side);
    onNotice(
      tr("{0} tag(s) ajouté(s) au prompt {1}.", [
        selected.length,
        side === "positive" ? tr("positif") : tr("négatif"),
      ]),
    );
    setSelected([]);
    setChosen([]);
  };

  /**
   * Turns the picked sets into one readable scene line: "卧室，晚礼服，诱惑姿态…"
   * The panel and the prompt box show `zh`; the English set names travel
   * alongside as `prompt` because that is the only usable form downstream.
   */
  const describe = () => {
    const labels = chosen.map((hit) => hit.label).filter(Boolean);
    const draft = sceneDraft(labels);
    setSelected([]);
    setChosen([]);
    if (!draft.text) return;
    onDescribe?.(draft.text, draft.prompt);
  };

  return (
    <div className="glossary">
      <label className="search-box glossary-search">
        <Search size={18} />
        <input
          ref={searchRef}
          aria-label={tr("Rechercher dans la bibliothèque")}
          placeholder={tr("Chercher une tenue, une pose, une ambiance…")}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setLimit(40);
          }}
        />
        {query && (
          <button
            aria-label={tr("Effacer la recherche")}
            onClick={() => {
              setQuery("");
              searchRef.current?.focus();
            }}
          >
            <X size={18} />
          </button>
        )}
      </label>

      {!query && (
        <>
          <div className="theme-grid">
            {sections.map((s) => {
              const Icon = ICONS[s.id] ?? Sparkles;
              return (
                <button
                  key={s.id}
                  className="theme-card"
                  aria-pressed={section === s.id}
                  onClick={() => setSection(s.id)}
                >
                  <span className="theme-icon">
                    <Icon />
                  </span>
                  <strong>{s.name}</strong>
                  <small>{tr(DETAILS[s.id] ?? "")}</small>
                </button>
              );
            })}
          </div>
          <div className="glossary-breadcrumb">
            <span>
              {tr("{0} · {1} ensembles · {2} tags", [
                active?.name ?? "",
                groups.reduce((sum, g) => sum + g.items.length, 0),
                active?.tags ?? 0,
              ])}
            </span>
            <ChevronRight size={13} />
            <span>{breadcrumbGroup(current?.name ?? "")}</span>
          </div>
          <div
            ref={groupRef}
            className="theme-choices"
            aria-label={tr("Ensembles")}
          >
            {groups.map((g) => (
              <button
                key={g.name}
                aria-pressed={(current?.name ?? "") === g.name}
                onClick={() => {
                  setGroup(g.name);
                  setLimit(40);
                }}
              >
                {breadcrumbGroup(g.name)}
              </button>
            ))}
          </div>
        </>
      )}

      <div className="section-heading">
        <h2>
          {query ? tr("Résultats de recherche") : tr("Choisissez vos tags")}
        </h2>
        <span className="muted">{hits.length}</span>
      </div>

      <div className="glossary-tags">
        {hits.slice(0, limit).map((hit) => {
          const on = hit.tags.every((tag) => selected.includes(tag));
          return (
            <button
              key={hit.tags.join("|")}
              className={`glossary-tag ${on ? "selected" : ""}`}
              aria-pressed={on}
              onClick={() => toggle(hit)}
            >
              <span>
                <strong>{hit.zh}</strong>
                <small>{hit.zhTags.slice(0, 4).join(" · ")}</small>
                {hit.context && <small>{hit.context}</small>}
                {hit.tags.length > 4 && (
                  <small>
                    {tr("+{0} tags", [hit.tags.length - 4])}
                  </small>
                )}
              </span>
              {on ? <Check size={18} /> : <Plus size={18} />}
            </button>
          );
        })}
      </div>

      {hits.length > limit && (
        <button className="load-more" onClick={() => setLimit((n) => n + 40)}>
          {tr("Afficher la suite")}
        </button>
      )}

      {!hits.length && (
        <div className="empty-state">
          <Search size={30} />
          <h3>{tr("Aucun ensemble trouvé")}</h3>
          <p>{tr("换个更短的中文词，或直接输入英文标签名试试。")}</p>
        </div>
      )}

      {!query && (
        <p className="hint">
          {tr("按中文搜套装名或标签，输入英文标签也认")} ·{" "}
          {tr("{0} tags · hors ligne · source Comfyui-Anima-Wardrobe", [total])}
        </p>
      )}

      {selected.length > 0 && (
        <div className="glossary-selection">
          <strong>
            {tr("Votre sélection ·")} {selected.length} tag(s)
          </strong>
          <div className="selected-tags">
            {selected.map((tag) => (
              <button
                key={tag}
                onClick={() => {
                  setSelected((old) => old.filter((t) => t !== tag));
                  setChosen((picked) =>
                    picked.filter((item) => !item.tags.includes(tag)),
                  );
                }}
                aria-label={tr("Retirer {0} de la sélection", [describeTag(tag)])}
              >
                {describeTag(tag)} <X size={13} />
              </button>
            ))}
          </div>
          <div>
            <button onClick={() => add("negative")}>
              <Minus size={16} /> {tr("Négatif")}
            </button>
            <button className="primary" onClick={() => add("positive")}>
              <Plus size={16} /> {tr("Positif")}
            </button>
          </div>
          {onDescribe && (
            <div>
              <button className="describe-send" onClick={describe}>
                <Send size={16} /> {tr("Send to the scene description")}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default memo(Wardrobe);
