import fs from "fs";
import path from "path";

// HTE-111: los colores salen de los tokens (var(--kk-…)). Ningún archivo de src/ escribe un color
// literal, salvo theme.css (generado) y tokens.json (la fuente).
const SRC = path.join(__dirname, "..");
const ALLOWED = new Set([
  path.join(SRC, "styles", "theme.css"),
  path.join(SRC, "styles", "tokens.json"),
]);

const COLOR_RE =
  /#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(|(?<![-.\w])(?:white|black|red|blue|green|gray|grey|orange|yellow|purple|silver|lightgray|darkgray)\b(?!-)/;

function sourceFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    if (!/\.(css|js|jsx)$/.test(entry.name)) return [];
    if (/\.test\.jsx?$/.test(entry.name) || ALLOWED.has(full)) return [];
    return [full];
  });
}

const stripComments = (text) =>
  text
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/(^|[^:"'`\\])\/\/[^\n]*/g, "$1");

export function findColorLiterals(text) {
  return stripComments(text)
    .split("\n")
    .map((line, i) => ({ line: i + 1, text: line.trim() }))
    .filter(({ text }) => COLOR_RE.test(text));
}

describe("no hard-coded colors", () => {
  test("no source file in src/ outside theme.css writes a color literal", () => {
    const offenders = sourceFiles(SRC).flatMap((file) =>
      findColorLiterals(fs.readFileSync(file, "utf8")).map(
        ({ line, text }) => `${path.relative(SRC, file)}:${line}  ${text}`,
      ),
    );
    expect(offenders).toEqual([]);
  });

  describe("detector", () => {
    test("positive: finds hex, rgb() and named colors", () => {
      expect(findColorLiterals("a { color: #fff; }")).toHaveLength(1);
      expect(findColorLiterals('style={{ background: "rgba(0,0,0,.4)" }}')).toHaveLength(1);
      expect(findColorLiterals('color: "red"')).toHaveLength(1);
    });

    test("negative: ignores tokens, comments and look-alike words", () => {
      expect(findColorLiterals("color: var(--kk-ink);")).toEqual([]);
      expect(findColorLiterals("/* was #fff */\n// red before")).toEqual([]);
      expect(findColorLiterals("white-space: nowrap;")).toEqual([]);
      expect(findColorLiterals("<BlinkingRedLine />")).toEqual([]);
    });

    test("edge: empty input and URLs with // are fine", () => {
      expect(findColorLiterals("")).toEqual([]);
      expect(findColorLiterals('const u = "https://example.com";')).toEqual([]);
    });
  });
});
