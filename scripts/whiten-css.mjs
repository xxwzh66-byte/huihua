/**
 * v1.0 "pure white" theme pass.
 *
 * The upstream palette is a lavender/pastel system spread over six stylesheets
 * as ~280 literal hex colours. Rewriting every rule by hand would be endless
 * churn, so this pass neutralises the chroma of every literal while keeping
 * luminance (and therefore the existing contrast ratios) intact. Semantic hues
 * that carry meaning — error red, success green, warning amber — are preserved.
 *
 * Run: node scripts/whiten-css.mjs
 */
import fs from "node:fs";
import path from "node:path";

const dir = path.resolve("src");
const files = fs.readdirSync(dir).filter((f) => f.endsWith(".css"));

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

function rgbToHsl(r, g, b) {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return [h * 360, s, l];
}

function hslToRgb(h, s, l) {
  if (s === 0) {
    const v = Math.round(clamp(l, 0, 1) * 255);
    return [v, v, v];
  }
  const hue2rgb = (p, q, t) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const hh = h / 360;
  return [
    Math.round(hue2rgb(p, q, hh + 1 / 3) * 255),
    Math.round(hue2rgb(p, q, hh) * 255),
    Math.round(hue2rgb(p, q, hh - 1 / 3) * 255),
  ];
}

/** Semantic hues survive the desaturation; everything decorative goes grey. */
const SEMANTIC = [
  [345, 375, 0.28], // error red (wraps past 360)
  [-15, 25, 0.28], // red / danger
  [85, 165, 0.22], // success green
  [25, 70, 0.35], // warning amber
];

const isSemantic = (h, s) =>
  SEMANTIC.some(([lo, hi, min]) => {
    if (s < min) return false;
    const hh = h < 0 ? h + 360 : h;
    return lo < 0 ? hh >= lo + 360 || hh <= hi : hh >= lo && hh <= hi;
  });

const hex2 = (n) => n.toString(16).padStart(2, "0");

const stats = { total: 0, changed: 0, semantic: 0 };

function whiten(match) {
  let raw = match.slice(1);
  let alpha = "";
  if (raw.length === 4) {
    // #rgba shorthand -> expand
    raw = raw
      .split("")
      .map((c) => c + c)
      .join("");
  }
  if (raw.length === 8) {
    alpha = raw.slice(6);
    raw = raw.slice(0, 6);
  } else if (raw.length !== 6) {
    return match;
  }
  const r = parseInt(raw.slice(0, 2), 16);
  const g = parseInt(raw.slice(2, 4), 16);
  const b = parseInt(raw.slice(4, 6), 16);
  const [h, s, l] = rgbToHsl(r, g, b);
  stats.total++;
  if (s < 0.04) return match; // already neutral
  if (isSemantic(h, s)) {
    stats.semantic++;
    return match;
  }
  const [nr, ng, nb] = hslToRgb(0, 0, l);
  stats.changed++;
  return "#" + hex2(nr) + hex2(ng) + hex2(nb) + alpha;
}

for (const name of files) {
  const file = path.join(dir, name);
  const before = fs.readFileSync(file, "utf8");
  const after = before.replace(/#[0-9a-fA-F]{3,8}\b/g, whiten);
  if (after !== before) fs.writeFileSync(file, after, "utf8");
}

console.log(
  `hex literals ${stats.total}, neutralised ${stats.changed}, kept semantic ${stats.semantic}`,
);
