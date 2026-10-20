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

// Las pruebas de contraste leen el CSS generado (lo que usa la app), no tokens.json: así un error
// del generador (alias mal resueltos, el valor oscuro equivocado) también las hace fallar.
const GENERATED = buildThemeCss(tokens);

// Declaraciones `--kk-x: valor;` de un bloque, por su selector exacto.
function declarationsOf(css, selector) {
  const start = css.indexOf(`${selector} {`);
  if (start === -1) throw new Error(`No block for ${selector}`);
  const body = css.slice(start + selector.length + 2, css.indexOf("}", start));
  return Object.fromEntries(
    [...body.matchAll(/(--kk-[\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2]]),
  );
}

const LIGHT = declarationsOf(GENERATED, ":root");
const DARK = declarationsOf(GENERATED, ':root[data-theme="dark"]');
const DARK_MEDIA = declarationsOf(
  GENERATED,
  '  :root:not([data-theme="light"])',
);

// Valor final de una variable en un tema, siguiendo var(--kk-…) como lo haría el navegador
// (el bloque oscuro hereda de :root lo que no redefine).
function colorOf(name, theme) {
  const scope = theme === "dark" ? { ...LIGHT, ...DARK } : LIGHT;
  let value = scope[`--kk-${name}`];
  for (let i = 0; value && i < 10; i++) {
    const ref = value.match(/^var\((--kk-[\w-]+)\)$/);
    if (!ref) break;
    value = scope[ref[1]];
  }
  if (!/^#[0-9a-f]{6}$/i.test(value || ""))
    throw new Error(`--kk-${name} (${theme}) is not a #rrggbb color: ${value}`);
  return value;
}

const expectContrast = (fg, bg, min) => {
  for (const theme of ["light", "dark"]) {
    const ratio = contrast(colorOf(fg, theme), colorOf(bg, theme));
    expect({ theme, fg, bg, ok: ratio >= min }).toEqual({
      theme,
      fg,
      bg,
      ok: true,
    });
  }
};

describe("build-theme", () => {
  describe("positive", () => {
    test("the committed theme.css matches the generator (run `npm run theme`)", () => {
      const committed = fs
        .readFileSync(THEME_CSS, "utf8")
        .replace(/\r\n/g, "\n");
      expect(committed).toBe(buildThemeCss(tokens));
    });

    test("writes light values on :root and dark values under both dark selectors", () => {
      const darkInk = tokens.color.tokens.find((t) => t.name === "ink").value
        .dark;
      expect(LIGHT["--kk-ink"]).toBe("#14171c");
      expect(DARK["--kk-ink"]).toBe(darkInk);
      // El bloque @media (prefers-color-scheme: dark) lleva exactamente los mismos valores.
      expect(GENERATED).toMatch(
        /@media \(prefers-color-scheme: dark\) \{\s*:root:not\(\[data-theme="light"\]\) \{/,
      );
      expect(DARK_MEDIA["--kk-ink"]).toBe(darkInk);
      expect(DARK_MEDIA).toEqual(DARK);
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
      for (const fg of ["ink", "ink-muted"]) {
        for (const bg of ["bg", "surface", "raised"])
          expectContrast(fg, bg, 4.5);
      }
    });

    test("every status pill's text reaches 4.5:1 on its ground in both themes, Deployed included", () => {
      for (const s of ["draft", "review", "changes", "approved"]) {
        expectContrast(`status-${s}-fg`, `status-${s}-bg`, 4.5);
      }
      // Deployed (OpenWorkflowModal.css .status-deployed) usa cyan-text sobre cyan-soft.
      expectContrast("cyan-text", "cyan-soft", 4.5);
    });

    test("control borders reach 3:1 and on-brand text 4.5:1 on brand fills", () => {
      expectContrast("border-strong", "surface", 3);
      expectContrast("on-brand", "brand-mint", 4.5);
      expectContrast("on-brand", "brand-cyan", 4.5);
      // Botones destructivos: texto surface sobre status-changes-fg.
      expectContrast("surface", "status-changes-fg", 4.5);
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
