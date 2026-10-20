import fs from "fs";
import path from "path";

// HTE-111: los colores salen de los tokens (var(--kk-…)). Ningún archivo de src/ escribe un color
// literal, salvo theme.css (generado) y tokens.json (la fuente). `transparent`, `currentColor` e
// `inherit` no son colores de diseño y se permiten.
const SRC = path.join(__dirname, "..");
const ALLOWED = new Set([
  path.join(SRC, "styles", "theme.css"),
  path.join(SRC, "styles", "tokens.json"),
]);

// Los 148 colores con nombre de CSS (CSS Color Module Level 4).
const NAMED_COLORS =
  `aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond
blue blueviolet brown burlywood cadetblue chartreuse chocolate coral cornflowerblue cornsilk
crimson cyan darkblue darkcyan darkgoldenrod darkgray darkgreen darkgrey darkkhaki darkmagenta
darkolivegreen darkorange darkorchid darkred darksalmon darkseagreen darkslateblue darkslategray
darkslategrey darkturquoise darkviolet deeppink deepskyblue dimgray dimgrey dodgerblue firebrick
floralwhite forestgreen fuchsia gainsboro ghostwhite gold goldenrod gray green greenyellow grey
honeydew hotpink indianred indigo ivory khaki lavender lavenderblush lawngreen lemonchiffon
lightblue lightcoral lightcyan lightgoldenrodyellow lightgray lightgreen lightgrey lightpink
lightsalmon lightseagreen lightskyblue lightslategray lightslategrey lightsteelblue lightyellow
lime limegreen linen magenta maroon mediumaquamarine mediumblue mediumorchid mediumpurple
mediumseagreen mediumslateblue mediumspringgreen mediumturquoise mediumvioletred midnightblue
mintcream mistyrose moccasin navajowhite navy oldlace olive olivedrab orange orangered orchid
palegoldenrod palegreen paleturquoise palevioletred papayawhip peachpuff peru pink plum
powderblue purple rebeccapurple red rosybrown royalblue saddlebrown salmon sandybrown seagreen
seashell sienna silver skyblue slateblue slategray slategrey snow springgreen steelblue tan teal
thistle tomato turquoise violet wheat white whitesmoke yellow yellowgreen`
    .split(/\s+/)
    .filter(Boolean);

const FUNCTIONAL_RE =
  /#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch)\(/i;
const NAMED_RE = new RegExp(
  `(?<![-\\w])(?:${NAMED_COLORS.join("|")})(?![-\\w])`,
  "i",
);

const stripComments = (text) =>
  text
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/(^|[^:"'`\\])\/\/[^\n]*/g, "$1");

// var(--kk-brand-cyan) contiene "cyan" pero es un token: se quita antes de buscar nombres.
const withoutVars = (value) => value.replace(/var\([^)]*\)/g, "");

// Valores de declaraciones CSS (`prop: valor`), en un .css o en un string de JS con CSS.
const declarationValues = (text) =>
  [...text.matchAll(/(?:^|[;{\s])-?[a-z][a-z-]*\s*:\s*([^;{}]+)/gim)].map(
    (m) => m[1],
  );

// Strings de JS con valor CSS: un atajo de borde ("1px solid red"), o todo el literal es un color
// después de una propiedad de color (`color: "teal"`, `fill="tomato"`, también en un ternario).
// Un string suelto como "Tan" no cuenta: puede ser texto.
const CSS_SHORTHAND_RE =
  /^[-\d.]+(?:px|em|rem|%)?\s+(?:[-\d.]+(?:px|em|rem|%)?\s+)*(?:(?:solid|dashed|dotted|double|inset)\s+)?([a-z]+)$/i;
const ONLY_NAMED_RE = new RegExp(`^${NAMED_RE.source}$`, "i");
const COLOR_PROP_BEFORE_RE =
  /(?:color|background\w*|fill|stroke|border\w*|outline\w*|shadow\w*)\s*[:=][^;,]*$/i;

function namedColorIn(line, isCss) {
  if (isCss)
    return declarationValues(line).some((v) => NAMED_RE.test(withoutVars(v)));
  return [...line.matchAll(/(["'`])((?:(?!\1)[^\\\n]|\\.)*)\1/g)].some(
    ({ 2: value, index }) => {
      const trimmed = value.trim();
      const shorthand = trimmed.match(CSS_SHORTHAND_RE);
      if (shorthand && NAMED_RE.test(shorthand[1])) return true;
      if (
        ONLY_NAMED_RE.test(trimmed) &&
        COLOR_PROP_BEFORE_RE.test(line.slice(0, index))
      )
        return true;
      // CSS dentro de un string (p. ej. style.cssText = "background:…;color:…").
      return (
        /:[^;]*;|;\s*[a-z-]+\s*:/i.test(value) &&
        declarationValues(value).some((v) => NAMED_RE.test(withoutVars(v)))
      );
    },
  );
}

export function findColorLiterals(text, { isCss = false } = {}) {
  return stripComments(text)
    .split("\n")
    .map((line, i) => ({ line: i + 1, text: line.trim() }))
    .filter(
      ({ text: line }) =>
        FUNCTIONAL_RE.test(withoutVars(line)) || namedColorIn(line, isCss),
    );
}

function sourceFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    if (!/\.(css|js|jsx)$/.test(entry.name)) return [];
    if (/\.test\.jsx?$/.test(entry.name) || ALLOWED.has(full)) return [];
    return [full];
  });
}

describe("no hard-coded colors", () => {
  test("no source file in src/ outside theme.css writes a color literal", () => {
    const offenders = sourceFiles(SRC).flatMap((file) =>
      findColorLiterals(fs.readFileSync(file, "utf8"), {
        isCss: file.endsWith(".css"),
      }).map(
        ({ line, text }) => `${path.relative(SRC, file)}:${line}  ${text}`,
      ),
    );
    expect(offenders).toEqual([]);
  });

  describe("detector", () => {
    test("positive: finds hex, color functions and any named color, in any case", () => {
      const css = { isCss: true };
      expect(findColorLiterals("a { color: #fff; }", css)).toHaveLength(1);
      expect(findColorLiterals("a { color: #ABCDEF; }", css)).toHaveLength(1);
      expect(findColorLiterals("a { color: RGB(0 0 0); }", css)).toHaveLength(
        1,
      );
      expect(findColorLiterals("a { color: teal; }", css)).toHaveLength(1);
      expect(
        findColorLiterals("a { border: 1px solid RED; }", css),
      ).toHaveLength(1);
      expect(
        findColorLiterals('style={{ background: "rgba(0,0,0,.4)" }}'),
      ).toHaveLength(1);
      expect(findColorLiterals('color: "Teal"')).toHaveLength(1);
      expect(findColorLiterals('border: "2px dashed navy"')).toHaveLength(1);
      expect(findColorLiterals('<rect fill="tomato" />')).toHaveLength(1);
      expect(
        findColorLiterals('color: active ? "Navy" : "var(--kk-ink)",'),
      ).toHaveLength(1);
      expect(
        findColorLiterals('el.style.cssText = "top:0;background:gold;";'),
      ).toHaveLength(1);
    });

    test("negative: ignores tokens, comments, allowed keywords and look-alike words", () => {
      const css = { isCss: true };
      expect(findColorLiterals("a { color: var(--kk-ink); }", css)).toEqual([]);
      expect(
        findColorLiterals("a { fill: var(--kk-brand-cyan); }", css),
      ).toEqual([]);
      expect(
        findColorLiterals(
          "a { background: transparent; color: currentColor; }",
          css,
        ),
      ).toEqual([]);
      expect(findColorLiterals("/* was #fff */\n// red before")).toEqual([]);
      expect(findColorLiterals("white-space: nowrap;", css)).toEqual([]);
      expect(findColorLiterals("<BlinkingRedLine />")).toEqual([]);
      // Palabras normales en textos de UI (español e inglés) no son colores.
      expect(findColorLiterals('label: "No es tan rápido"')).toEqual([]);
      expect(findColorLiterals('title: "Go to the navy yard"')).toEqual([]);
      expect(findColorLiterals('const tan = "Tan";')).toEqual([]);
    });

    test("edge: empty input and URLs with // are fine", () => {
      expect(findColorLiterals("")).toEqual([]);
      expect(findColorLiterals('const u = "https://example.com";')).toEqual([]);
    });
  });
});
