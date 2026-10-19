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

// Todas las referencias UI_STRINGS.a.b.c del código (sin la parte dinámica [x]).
const references = sourceFiles(SRC).flatMap((file) =>
  [
    ...fs
      .readFileSync(file, "utf8")
      .matchAll(/UI_STRINGS(?:\.[A-Za-z_$][\w$]*)+/g),
  ].map((m) => ({ file: path.relative(SRC, file), keyPath: m[0] })),
);

describe("UI_STRINGS", () => {
  describe("positive", () => {
    test("every entry is a non-empty string or a function that returns one", () => {
      for (const [keyPath, value] of leaves(UI_STRINGS)) {
        if (typeof value === "function") {
          const args = Array.from(
            { length: value.length },
            (_, i) => `arg${i}`,
          );
          expect(typeof value(...args)).toBe("string");
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
