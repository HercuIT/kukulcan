#!/usr/bin/env node
// Genera src/styles/theme.css a partir de src/styles/tokens.json (el design system de Kukulcan).
// Uso: npm run theme. theme.css no se edita a mano: se cambia tokens.json y se regenera.
const fs = require("fs");
const path = require("path");

const TOKENS = path.join(__dirname, "..", "src", "styles", "tokens.json");
const OUT = path.join(__dirname, "..", "src", "styles", "theme.css");

// Nombre de token → identificador CSS válido (letras, dígitos, guion y guion bajo).
const cssName = (name) =>
  String(name)
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");

const prop = (name) => `--kk-${cssName(name)}`;

// "{mint-soft}" → var(--kk-mint-soft); otro valor, tal cual.
const resolve = (value) => {
  const alias = typeof value === "string" && value.match(/^\{([^}]+)\}$/);
  return alias ? `var(${prop(alias[1])})` : value;
};

// Valor de un token para un tema. Un token con un solo valor vale igual en todos los temas;
// si le falta el valor oscuro, usa el claro (como define el design system).
const valueFor = (token, theme) => {
  const v = token.value;
  if (v && typeof v === "object") return resolve(v[theme] ?? v.light);
  return resolve(v);
};

const tokensOf = (family) => (family && Array.isArray(family.tokens) ? family.tokens : []);

function declarations(tokens, theme) {
  return tokens
    .filter((t) => t && t.name !== undefined && t.value !== undefined)
    .map((t) => `  ${prop(t.name)}: ${valueFor(t, theme)};`);
}

function textStyleClass(style, familyVar) {
  const lines = [
    `  font-family: var(${familyVar});`,
    style.fontSize && `  font-size: ${style.fontSize};`,
    style.lineHeight && `  line-height: ${style.lineHeight};`,
    style.fontWeight !== undefined && `  font-weight: ${style.fontWeight};`,
    style.letterSpacing && `  letter-spacing: ${style.letterSpacing};`,
  ].filter(Boolean);
  return `.kk-text-${cssName(style.name)} {\n${lines.join("\n")}\n}`;
}

/**
 * tokens.json → texto de theme.css.
 * - :root: valores claros de color y sombra, más espaciado, radios y familias tipográficas.
 * - Oscuro: bajo :root[data-theme="dark"] y bajo prefers-color-scheme: dark si el usuario no
 *   eligió el claro (:root:not([data-theme="light"])).
 * - Una clase .kk-text-<estilo> por estilo de texto.
 */
function buildThemeCss(tokens) {
  const themed = [...tokensOf(tokens.color), ...tokensOf(tokens.shadow)];
  const fixed = [...tokensOf(tokens.spacing), ...tokensOf(tokens.radius)];
  const families = (tokens.type && tokens.type.families) || {};
  const familyDecls = Object.entries(families).map(
    ([name, stack]) => `  --kk-font-${cssName(name)}: ${stack};`,
  );

  const rootDecls = [
    ...declarations(themed, "light"),
    ...declarations(fixed, "light"),
    ...familyDecls,
  ];
  const darkDecls = declarations(themed, "dark");

  const textClasses = ((tokens.type && tokens.type.groups) || []).flatMap(
    (group) =>
      (group.styles || []).map((style) =>
        textStyleClass(style, `--kk-font-${cssName(group.family)}`),
      ),
  );

  const blocks = [
    `/* Generado por scripts/build-theme.js desde src/styles/tokens.json (${tokens.name || "tokens"} v${tokens.version ?? "?"}).\n   No editar a mano: cambia tokens.json y corre \`npm run theme\`. */`,
    `:root {\n  color-scheme: light;\n${rootDecls.join("\n")}\n}`,
  ];
  if (darkDecls.length) {
    const dark = `  color-scheme: dark;\n${darkDecls.join("\n")}`;
    blocks.push(`:root[data-theme="dark"] {\n${dark}\n}`);
    blocks.push(
      `@media (prefers-color-scheme: dark) {\n  :root:not([data-theme="light"]) {\n${dark
        .split("\n")
        .map((l) => `  ${l}`)
        .join("\n")}\n  }\n}`,
    );
  }
  blocks.push(...textClasses);
  return `${blocks.join("\n\n")}\n`;
}

module.exports = { buildThemeCss, cssName };

if (require.main === module) {
  const tokens = JSON.parse(fs.readFileSync(TOKENS, "utf8"));
  fs.writeFileSync(OUT, buildThemeCss(tokens));
  console.log(`Escrito ${path.relative(process.cwd(), OUT)}`);
}
