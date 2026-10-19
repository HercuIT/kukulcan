import fs from "fs";
import path from "path";
import tokens from "./tokens.json";

const { buildThemeCss, cssName } = require("../../scripts/build-theme");

const THEME_CSS = path.join(__dirname, "theme.css");

// Contraste WCAG entre dos colores #rrggbb.
function luminance(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const contrast = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

// Valor final de un token de color en un tema, siguiendo los alias {otro-token}.
function colorOf(name, theme) {
  const token = tokens.color.tokens.find((t) => t.name === name);
  const raw =
    typeof token.value === "object"
      ? (token.value[theme] ?? token.value.light)
      : token.value;
  const alias = raw.match(/^\{(.+)\}$/);
  return alias ? colorOf(alias[1], theme) : raw;
}

describe("build-theme", () => {
  describe("positive", () => {
    test("the committed theme.css matches the generator (run `npm run theme`)", () => {
      const committed = fs
        .readFileSync(THEME_CSS, "utf8")
        .replace(/\r\n/g, "\n");
      expect(committed).toBe(buildThemeCss(tokens));
    });

    test("writes light values on :root and dark values under both dark selectors", () => {
      const css = buildThemeCss(tokens);
      expect(css).toMatch(/:root \{[^}]*--kk-ink: #14171c;/);
      expect(css).toMatch(/:root\[data-theme="dark"\] \{[^}]*--kk-ink: /);
      expect(css).toContain(':root:not([data-theme="light"])');
    });

    test("turns {alias} values into var() references", () => {
      const css = buildThemeCss({
        color: {
          tokens: [
            { name: "a", value: { light: "#111111", dark: "#222222" } },
            { name: "b", value: { light: "{a}", dark: "{a}" } },
          ],
        },
      });
      expect(css).toContain("--kk-b: var(--kk-a);");
    });

    test("ink and ink-muted reach 4.5:1 on bg, surface and raised in both themes", () => {
      for (const theme of ["light", "dark"]) {
        for (const fg of ["ink", "ink-muted"]) {
          for (const bg of ["bg", "surface", "raised"]) {
            const ratio = contrast(colorOf(fg, theme), colorOf(bg, theme));
            expect({ theme, fg, bg, ok: ratio >= 4.5 }).toEqual({
              theme,
              fg,
              bg,
              ok: true,
            });
          }
        }
      }
    });

    test("status foregrounds reach 4.5:1 on their own backgrounds in both themes", () => {
      for (const theme of ["light", "dark"]) {
        for (const s of ["draft", "review", "changes", "approved"]) {
          const ratio = contrast(
            colorOf(`status-${s}-fg`, theme),
            colorOf(`status-${s}-bg`, theme),
          );
          expect({ theme, s, ok: ratio >= 4.5 }).toEqual({
            theme,
            s,
            ok: true,
          });
        }
      }
    });
  });

  describe("negative", () => {
    test("a token without a dark value falls back to its light value", () => {
      const css = buildThemeCss({
        color: { tokens: [{ name: "x", value: { light: "#abcdef" } }] },
      });
      const dark = css.slice(css.indexOf('[data-theme="dark"]'));
      expect(dark).toContain("--kk-x: #abcdef;");
    });

    test("tokens without a name or value are skipped", () => {
      const css = buildThemeCss({
        color: { tokens: [{ value: "#fff" }, { name: "y" }, null] },
      });
      expect(css).not.toMatch(/--kk-\S*: /);
    });
  });

  describe("edge", () => {
    test("sanitises token names into valid CSS identifiers", () => {
      expect(cssName("  status draft/bg ")).toBe("status-draft-bg");
      expect(cssName("--odd--")).toBe("odd");
      expect(cssName("a_b-1")).toBe("a_b-1");
    });

    test("an empty token file still yields a valid :root block and no dark block", () => {
      const css = buildThemeCss({});
      expect(css).toContain(":root {");
      expect(css).not.toContain("data-theme");
    });

    test("a family with an empty stack still gets its custom property", () => {
      const css = buildThemeCss({ type: { families: { sans: "" } } });
      expect(css).toContain("--kk-font-sans: ;");
    });
  });
});
