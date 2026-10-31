/**
 * Chinese readings for the wardrobe.
 *
 * `wardrobe.json` stores the sets exactly the way ComfyUI wants them: English
 * underscore tags. Those strings are what the prompt must contain, but they are
 * unreadable in the panel, so every set and every tag gets a separate Chinese
 * reading here.
 *
 * The English strings are never rewritten — `names` is a lookup table
 * `english tag -> Chinese reading`. Anything absent falls back to the English
 * text with the underscores turned into spaces, so a half-translated catalogue
 * still renders.
 */
import { normalizeSearch } from "./taxonomy";
import shardA from "./data/wardrobe.a.clothing.json";
import shardB from "./data/wardrobe.b.pose.json";
import shardCClothing from "./data/wardrobe.c.clothing.json";
import shardCPose from "./data/wardrobe.c.pose.json";
import shardDClothing from "./data/wardrobe.d.clothing.json";
import shardDScene from "./data/wardrobe.d.scene.json";
import shardDExpression from "./data/wardrobe.d.expression.json";

type ShardLabel = {
  label: string;
  zh: string;
  tags: string[];
  tag_zh: Record<string, string>;
};

type ShardUnit = {
  id?: string;
  g: string;
  g_zh?: string;
  labels: ShardLabel[];
};

const shards = [
  shardA,
  shardB,
  shardCClothing,
  shardCPose,
  shardDClothing,
  shardDScene,
  shardDExpression,
] as { shelf?: string; units: ShardUnit[] }[];

/** English group name -> Chinese breadcrumb reading. */
const GROUP: Record<string, string> = {
  clothing: "服装",
  scene: "场景",
  pose: "姿势",
  expression: "表情",
};

const groupZh = new Map<string, string>();
const setZh = new Map<string, string>();
const tagZh = new Map<string, string>();

for (const shard of shards) {
  for (const unit of shard.units ?? []) {
    const tail = unit.g.split("/").slice(1).join("/").trim() || unit.g;
    const reading = unit.g_zh?.trim() || tail;
    groupZh.set(unit.g, reading);
    // Groups are also looked up by their bare tail ("穿着状态") and by their
    // English prefix, so the panel can ask for either spelling.
    groupZh.set(tail, reading);
    if (unit.id && GROUP[unit.id]) groupZh.set(unit.id, GROUP[unit.id]);
    for (const item of unit.labels ?? []) {
      if (!setZh.has(item.label)) setZh.set(item.label, item.zh?.trim() || "");
      for (const tag of item.tags ?? []) {
        const reading = item.tag_zh?.[tag];
        if (reading && !tagZh.has(tag)) tagZh.set(tag, reading);
      }
    }
  }
}
groupZh.set("服装", "服装");
groupZh.set("场景", "场景");
groupZh.set("姿势", "姿势");
groupZh.set("表情", "表情");

/** Tag with underscores already softened, used as the last-resort reading. */
const plain = (s: string) => s.replace(/_/g, " ").trim();

/** A group name, printed as its Chinese reading. */
export function groupLabel(name: string): string {
  const direct = groupZh.get(name);
  if (direct) return direct;
  const tail = name.split("/").slice(1).join("/").trim();
  if (tail && groupZh.has(tail)) return groupZh.get(tail)!;
  const bracketed = name.match(/^([^/]+)\/(.+)$/);
  if (bracketed) {
    const [, head, rest] = bracketed;
    const shelf = GROUP[head.trim()] ?? head.trim();
    return rest.trim() ? rest.trim() : shelf;
  }
  return name;
}

/** A set name (English prompt or an already-Chinese name), printed in Chinese. */
export function describeSet(label: string): string {
  return setZh.get(label)?.trim() || plain(label);
}

/** One English tag, printed in Chinese. */
export function describeTag(tag: string): string {
  return tagZh.get(tag) || plain(tag);
}

/** A run of English tags, printed in Chinese. */
export function describeTags(tags: string[]): string[] {
  return tags.map(describeTag);
}

/** Whether a query matches a set — by English tag, Chinese reading, or group. */
export function matchesSet(
  item: { label: string; tags: string[] },
  query: string,
  groupName = "",
): boolean {
  const q = normalizeSearch(query);
  if (!q) return true;
  const haystack = normalizeSearch(
    `${item.label} ${describeSet(item.label)} ${item.tags.join(" ")} ${describeTags(item.tags).join(" ")} ${groupLabel(groupName)} ${groupName}`,
  );
  return haystack.includes(q);
}

/**
 * The scene line for the prompt page.
 *
 * `text` is the readable Chinese summary shown in the box; `prompt` is the same
 * selection written as the English set names, because that is the only thing
 * the image model reads. Duplicated labels are dropped from both.
 */
export function sceneDraft(labels: string[]): { text: string; prompt: string } {
  const unique = [...new Set(labels.filter(Boolean))];
  return {
    text: unique.map(describeSet).join("，"),
    prompt: unique.join(", "),
  };
}
