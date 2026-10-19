#!/usr/bin/env node
/*
  One-off migration helper for HTE-111: rewrites hard-coded color literals in src/ to the
  Kukulcan tokens (var(--kk-…)). Property- and context-aware: it looks at the CSS property and at
  the rest of the rule / style object to decide (e.g. white text on a brand fill → on-brand).

  Usage: node scripts/convert-colors.js [--write] <file…>
  Without --write it prints the planned changes only. Review the diff afterwards; the mapping is a
  starting point, not a substitute for looking at the screen.
*/
const fs = require("fs");

const NAMED = {
  white: "#ffffff",
  black: "#000000",
  red: "#ff0000",
  blue: "#0000ff",
  green: "#008000",
  gray: "#808080",
  grey: "#808080",
  orange: "#ffa500",
  yellow: "#ffff00",
  purple: "#800080",
  lightgray: "#d3d3d3",
  lightgrey: "#d3d3d3",
  darkgray: "#a9a9a9",
  silver: "#c0c0c0",
};

const COLOR_RE =
  /#[0-9a-fA-F]{8}\b|#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3,4}\b|rgba?\([^)]*\)|\b(?:white|black|red|blue|green|gray|grey|orange|yellow|purple|lightgray|lightgrey|darkgray|silver)\b/g;

function parseColor(lit) {
  let s = lit.toLowerCase();
  if (NAMED[s]) s = NAMED[s];
  if (s.startsWith("#")) {
    let h = s.slice(1);
    if (h.length <= 4) h = [...h].map((c) => c + c).join("");
    const n = (i) => parseInt(h.slice(i, i + 2), 16);
    return {
      r: n(0),
      g: n(2),
      b: n(4),
      a: h.length === 8 ? n(6) / 255 : 1,
    };
  }
  const m = s.match(/rgba?\(([^)]*)\)/);
  if (!m) return null;
  const p = m[1]
    .split(/[\s,/]+/)
    .filter(Boolean)
    .map(parseFloat);
  return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
}

function hsl({ r, g, b }) {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return { h: h * 60, s, l };
}

const v = (name) => `var(--kk-${name})`;

function family(c) {
  const { h, s, l } = hsl(c);
  // Slate grays (#374151, #1f2937…) carry a little blue but read as neutral.
  if (s < 0.15 || (s < 0.3 && l > 0.9) || (s < 0.45 && l < 0.35)) return "gray";
  if (h < 18 || h >= 330) return "red";
  if (h < 65) return "yellow";
  if (h < 165) return "green";
  if (h < 265) return "blue";
  return "blue";
}

// kind: "bg" | "text" | "border" | "shadow" | "other"
function kindOf(prop) {
  const p = prop.toLowerCase().replace(/[A-Z]/g, (m) => "-" + m.toLowerCase());
  if (/shadow/.test(p)) return "shadow";
  if (/^background/.test(p) || p === "fill") return "bg";
  if (/border|outline|stroke/.test(p)) return "border";
  if (p === "color" || p === "caret-color") return "text";
  return "other";
}

/** Maps one color in one declaration to a token. `ctx` = the whole rule/object text. */
function mapColor(lit, prop, ctx) {
  const c = parseColor(lit);
  if (!c) return null;
  const kind = kindOf(prop);
  const fam = family(c);
  const { l } = hsl(c);

  // Translucent dark fills are backdrops; other translucent colors map by their base color.
  if (kind === "bg" && c.a < 1 && l < 0.3) return v("scrim");
  if (lit.toLowerCase() === "#17a2b8") return v("brand-cyan");

  if (fam === "gray") {
    if (kind === "bg") {
      if (l >= 0.97) return v("surface");
      if (l >= 0.85) return v("raised");
      if (l >= 0.6) return v("border");
      if (l >= 0.3) return v("ink-muted");
      return v("ink");
    }
    if (kind === "text") {
      if (l >= 0.97) return brandFill(ctx) ? v("on-brand") : v("surface");
      if (l >= 0.3) return v("ink-muted");
      return v("ink");
    }
    if (kind === "border") {
      if (l >= 0.97) return v("surface");
      if (l >= 0.75) return v("border");
      return v("border-strong");
    }
    return l >= 0.5 ? v("border") : v("ink");
  }

  const light = l >= 0.85;
  if (fam === "red") {
    if (kind === "bg")
      return light ? v("status-changes-bg") : v("status-changes-fg");
    return v("status-changes-fg");
  }
  if (fam === "yellow") {
    if (kind === "bg")
      return light ? v("status-review-bg") : v("status-review-bg");
    return v("status-review-fg");
  }
  if (fam === "green") {
    if (kind === "bg") return light ? v("mint-soft") : v("brand-mint");
    return v("mint-text");
  }
  // blue / purple
  if (kind === "bg") return light ? v("cyan-soft") : v("brand-mint");
  return v("cyan-text");
}

/** True when the rule paints a green/blue fill (→ brand-mint), so white text becomes on-brand. */
function brandFill(ctx) {
  const re = /(background(?:-color)?|backgroundColor)\s*:\s*([^;\n}]+)/gi;
  let m;
  while ((m = re.exec(ctx))) {
    const val = m[2];
    if (/var\(--kk-(brand-mint|brand-cyan)\)/.test(val)) return true;
    const lits = val.match(COLOR_RE) || [];
    for (const lit of lits) {
      const c = parseColor(lit);
      const fam = c && family(c);
      if ((fam === "green" || fam === "blue") && hsl(c).l < 0.85) return true;
    }
  }
  return false;
}

function mapShadow(value) {
  // A spread-only shadow (0 0 0 Npx) is a focus/selection ring, not elevation.
  const ring = value.match(/^\s*0\s+0\s+0\s+(\d+px)/);
  if (ring) return `0 0 0 ${ring[1]} ${v("cyan-soft")}`;
  // Largest blur in the value decides: overlays (menus, modals) vs. resting nodes/cards.
  const blurs = [
    ...value.matchAll(
      /(-?\d*\.?\d+)(?:px)?\s+(-?\d*\.?\d+)(?:px)?\s+(\d*\.?\d+)(?:px)?/g,
    ),
  ].map((m) => parseFloat(m[3]));
  const blur = blurs.length ? Math.max(...blurs) : 0;
  return blur >= 10 ? v("shadow-overlay") : v("shadow-node");
}

/** Converts one file's text. Returns { text, changes[] }. */
function convert(text, file) {
  const isCss = file.endsWith(".css");
  const changes = [];
  // Declaration: CSS `prop: value;` or JS `prop: "value"` / `prop: 'value'`.
  const declRe = isCss
    ? /([a-zA-Z-]+)(\s*:\s*)([^;{}]*)/g
    : /([a-zA-Z]+)(\s*:\s*)(["'`])([^"'`\n]*)\3/g;

  // Context = the enclosing CSS rule, or a ±8-line window in JS.
  const lines = text.split("\n");
  const lineStarts = [];
  let pos = 0;
  for (const ln of lines) {
    lineStarts.push(pos);
    pos += ln.length + 1;
  }
  const lineAt = (i) => {
    let lo = 0;
    let hi = lineStarts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (lineStarts[mid] <= i) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  };
  const ctxFor = (i) => {
    if (isCss) {
      const open = text.lastIndexOf("{", i);
      const close = text.indexOf("}", i);
      return text.slice(open, close === -1 ? text.length : close);
    }
    const ln = lineAt(i);
    return lines.slice(Math.max(0, ln - 8), ln + 9).join("\n");
  };

  // Skip comments (CSS and JS block comments, JS line comments).
  const commentSpans = [];
  for (const m of text.matchAll(/\/\*[\s\S]*?\*\//g))
    commentSpans.push([m.index, m.index + m[0].length]);
  if (!isCss)
    for (const m of text.matchAll(/(^|[^:"'`])\/\/[^\n]*/g))
      commentSpans.push([m.index, m.index + m[0].length]);
  const inComment = (i) => commentSpans.some(([a, b]) => i >= a && i < b);

  if (!isCss) {
    // JS: every string literal that holds a color. The property is the nearest `prop:` /
    // `prop =` to its left on the same line, which also covers ternaries
    // (`background: on ? "#1677ff" : "#fff"`) and `el.style.background = "#d0f0d0"`.
    const out = text.replace(
      /(["'])([^"'\n]*)\1/g,
      (whole, quote, value, offset) => {
        if (inComment(offset)) return whole;
        COLOR_RE.lastIndex = 0;
        if (!COLOR_RE.test(value)) return whole;
        COLOR_RE.lastIndex = 0;
        const left = text.slice(lineStarts[lineAt(offset)], offset);
        const props = [...left.matchAll(/([a-zA-Z]+)\s*(?::|=(?!=))\s*/g)];
        if (!props.length) return whole;
        const prop = props[props.length - 1][1];
        const kind = kindOf(prop);
        if (kind === "other") return whole;
        const next =
          kind === "shadow"
            ? mapShadow(value)
            : value.replace(
                COLOR_RE,
                (lit) => mapColor(lit, prop, ctxFor(offset)) || lit,
              );
        if (next === value) return whole;
        changes.push({ line: lineAt(offset) + 1, prop, from: value, to: next });
        return `${quote}${next}${quote}`;
      },
    );
    return { text: out, changes };
  }

  const out = text.replace(declRe, (...args) => {
    const whole = args[0];
    const offset = isCss ? args[4] : args[5];
    if (inComment(offset)) return whole;
    const prop = args[1];
    const sep = args[2];
    const quote = isCss ? "" : args[3];
    const value = isCss ? args[3] : args[4];
    if (/var\(--kk-/.test(value) && !COLOR_RE.test(value)) return whole;
    COLOR_RE.lastIndex = 0;
    if (!COLOR_RE.test(value)) return whole;
    COLOR_RE.lastIndex = 0;
    if (kindOf(prop) === "other") return whole;

    let next;
    if (kindOf(prop) === "shadow") {
      next = mapShadow(value);
    } else {
      const ctx = ctxFor(offset);
      next = value.replace(COLOR_RE, (lit) => mapColor(lit, prop, ctx) || lit);
    }
    if (next === value) return whole;
    changes.push({
      line: lineAt(offset) + 1,
      prop,
      from: value.trim(),
      to: next.trim(),
    });
    return isCss
      ? `${prop}${sep}${next}`
      : `${prop}${sep}${quote}${next}${quote}`;
  });
  return { text: out, changes };
}

module.exports = { convert, mapColor, mapShadow, parseColor, family };

if (require.main === module) {
  const args = process.argv.slice(2);
  const write = args.includes("--write");
  for (const file of args.filter((a) => a !== "--write")) {
    const src = fs.readFileSync(file, "utf8");
    const { text, changes } = convert(src, file);
    for (const c of changes)
      console.log(`${file}:${c.line}  ${c.prop}: ${c.from}  →  ${c.to}`);
    if (write && text !== src) fs.writeFileSync(file, text);
  }
}
