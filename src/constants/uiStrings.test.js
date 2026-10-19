import fs from "fs";
import path from "path";
import { UI_STRINGS } from "./uiStrings";

const SRC = path.join(__dirname, "..");

function sourceFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return /\.js$/.test(entry.name) && !/\.test\.js$/.test(entry.name)
      ? [full]
      : [];
  });
}

function leaves(node, prefix = "UI_STRINGS") {
  return Object.entries(node).flatMap(([key, value]) =>
    value && typeof value === "object"
      ? leaves(value, `${prefix}.${key}`)
      : [[`${prefix}.${key}`, value]],
  );
}

const resolve = (keyPath) =>
  keyPath
    .split(".")
    .slice(1)
    .reduce(
      (node, part) => (node == null ? undefined : node[part]),
      UI_STRINGS,
    );

const PATH = "(?:\\.[A-Za-z_$][\\w$]*)+";

// Todas las referencias UI_STRINGS.a.b.c del código (sin la parte dinámica [x]), incluidas las
// que pasan por un alias como `const S = UI_STRINGS.setPassword;` → `S.title`.
function referencesIn(file) {
  const code = fs.readFileSync(file, "utf8");
  const rel = path.relative(SRC, file);
  const refs = [...code.matchAll(new RegExp(`UI_STRINGS${PATH}`, "g"))].map(
    (m) => ({ file: rel, keyPath: m[0] }),
  );
  const aliases = code.matchAll(
    new RegExp(
      `const\\s+([A-Za-z_$][\\w$]*)\\s*=\\s*(UI_STRINGS(?:${PATH})?)\\s*;`,
      "g",
    ),
  );
  for (const [, alias, base] of aliases) {
    const uses = code.matchAll(
      new RegExp(`(?<![\\w$.])${alias.replace("$", "\\$")}(${PATH})`, "g"),
    );
    for (const [, suffix] of uses) {
      refs.push({ file: rel, keyPath: base + suffix, alias });
    }
  }
  return refs;
}

const references = sourceFiles(SRC).flatMap(referencesIn);

describe("UI_STRINGS", () => {
  describe("positive", () => {
    test("every entry is a non-empty string or a function that returns one", () => {
      for (const [keyPath, value] of leaves(UI_STRINGS)) {
        if (typeof value === "function") {
          const args = Array.from(
            { length: value.length },
            (_, i) => `arg${i}`,
          );
          const rendered = value(...args);
          expect(typeof rendered).toBe("string");
          expect(rendered.trim()).not.toBe("");
        } else {
          expect(typeof value).toBe("string");
          expect(value.trim()).not.toBe("");
        }
        expect(keyPath).toMatch(/^UI_STRINGS\.[a-z]/);
      }
    });

    test("template entries interpolate their arguments", () => {
      expect(UI_STRINGS.dashboard.shareWorkflowModal.title("Linea 1")).toBe(
        'Workflow Actions - "Linea 1"',
      );
      expect(
        UI_STRINGS.dashboard.menuBar.alerts.seleccionaste("File", "Undo"),
      ).toBe("Seleccionaste: File > Undo");
      expect(UI_STRINGS.dashboard.validation.unreachableNode("n7")).toBe(
        'Nodo "n7" no es alcanzable desde START.',
      );
    });

    test("components use the strings module", () => {
      expect(references.length).toBeGreaterThan(300);
    });

    test("references through an alias are checked too", () => {
      const aliased = references.filter(
        (r) => r.file.endsWith("SetPassword.js") && r.alias === "S",
      );
      expect(aliased.map((r) => r.keyPath)).toContain(
        "UI_STRINGS.setPassword.title",
      );
    });
  });

  describe("negative", () => {
    test("every UI_STRINGS key used in src/ exists", () => {
      const missing = references.filter(
        ({ keyPath }) => resolve(keyPath) === undefined,
      );
      expect(missing).toEqual([]);
    });
  });

  describe("edge", () => {
    test("menu labels cover every menu id and option the menu bars render", () => {
      const ids = [
        "TMApp",
        "Home",
        "Settings",
        "Profile",
        "File",
        "New",
        "Open",
        "Save",
        "Save As",
        "Exit",
        "Checkout",
        "Version History",
        "Edit",
        "Undo",
        "Redo",
        "Cut",
        "Copy",
        "Paste",
        "View",
        "Zoom In",
        "Zoom Out",
        "Full Screen",
        "Help",
        "Documentation",
        "About",
        "Contact",
      ];
      for (const id of ids) {
        expect(UI_STRINGS.dashboard.menuBar.menuLabels[id]).toBe(id);
      }
      expect(UI_STRINGS.home.menuBar.menuLabels.Checkout).toBeUndefined();
    });

    test("strings keep their original wording, including trailing spaces and line breaks", () => {
      expect(UI_STRINGS.dashboard.page.alerts.errorPrefix).toBe("Error: ");
      expect(UI_STRINGS.dashboard.page.messages.errorDeValidacion).toBe(
        "❌ Error de validación:\n\n",
      );
      expect(UI_STRINGS.login.iniciarSesion).toBe("Iniciar Sesión");
    });
  });
});
