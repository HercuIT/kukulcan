import { render, screen, fireEvent, act } from "@testing-library/react";
import * as api from "../../backend/definitionsApi";
import { UI_STRINGS } from "../../constants/uiStrings";
import UserDefinitionsTree, {
  canDropOn,
  definitionErrorText,
} from "./UserDefinitionsTree";

jest.mock("../../backend/supabaseClient", () => ({ supabase: {} }));
jest.mock("../../backend/definitionsApi", () => {
  const actual = jest.requireActual("../../backend/definitionsApi");
  return {
    ...actual,
    subscribeToDefinitions: jest.fn(),
    listDefinitions: jest.fn(),
    createDefinition: jest.fn(),
    updateDefinition: jest.fn(),
    moveDefinition: jest.fn(),
    deleteDefinition: jest.fn(),
    addPredefinedChild: jest.fn(),
  };
});

const S = UI_STRINGS.dashboard.userDefinitionsTree;

const def = (id, parentId, name, position = 0, extra = {}) => ({
  id,
  parentId,
  kind: "user",
  name,
  version: "1.0",
  parameters: [],
  implementation: {},
  predefined: null,
  position,
  ...extra,
});

const ROWS = [
  def("line", null, "Line 1", 0, {
    parameters: [{ name: "Speed", dataType: "REAL", defaultValue: 1 }],
  }),
  def("mixer", "line", "Mixer A", 0),
  def("dosing", "mixer", "Dosing", 0),
  def("packer", "line", "Packer", 1),
  def("cleaning", null, "Cleaning", 1),
];

let createModalProps;

async function renderTree(rows = ROWS, props = {}) {
  api.subscribeToDefinitions.mockImplementation((cb) => {
    cb(rows);
    return () => {};
  });
  api.listDefinitions.mockResolvedValue(rows);
  const setDragComponent = jest.fn((c) => (window._dragComponent = c));
  let utils;
  await act(async () => {
    utils = render(
      <UserDefinitionsTree
        label="User Created Definitions"
        isOpen
        onToggle={jest.fn()}
        isDesigner
        setDragComponent={setDragComponent}
        openParamDetails={jest.fn()}
        renderCreateModal={(p) => {
          createModalProps = p;
          return null;
        }}
        {...props}
      />,
    );
  });
  return { ...utils, setDragComponent };
}

const row = (id) => screen.getByTestId(`definition-row-${id}`);
const expand = (id) => fireEvent.click(row(id).querySelector("span"));
const openMenuOn = (el) =>
  fireEvent.contextMenu(el, { clientX: 5, clientY: 5 });
const clickMenu = async (label) => {
  await act(async () => {
    fireEvent.click(screen.getByRole("menuitem", { name: label }));
  });
};

beforeEach(() => {
  jest.clearAllMocks();
  window._dragComponent = null;
  createModalProps = null;
});

describe("UserDefinitionsTree", () => {
  describe("positive", () => {
    test("shows the top-level count and expands nested definitions, groups after children", async () => {
      await renderTree();
      expect(screen.getByTestId("user-definitions-root")).toHaveTextContent(
        "User Created Definitions (2)",
      );
      expect(screen.queryByTestId("definition-row-mixer")).toBeNull();
      expand("line");
      expand("mixer");
      const texts = screen
        .getAllByText(/v 1\.0|Parameters/)
        .map((el) => el.textContent.trim());
      expect(texts.indexOf("Dosing v 1.0")).toBeLessThan(
        texts.findIndex((t) => t.startsWith("Parameters")),
      );
      expect(row("dosing")).toBeInTheDocument();
    });

    test("New definition inside opens the create modal with the parent path and creates through the API", async () => {
      api.createDefinition.mockResolvedValue("new-id");
      await renderTree();
      openMenuOn(row("line"));
      await clickMenu(S.menu.newInside);
      expect(createModalProps.open).toBe(true);
      expect(createModalProps.parentPath).toEqual(["Line 1"]);
      await act(async () => {
        await createModalProps.onOk({
          name: "Heater",
          version: "1.0",
          desc: "d",
          abstract: "a",
          implementation: { program: "MainProgram" },
          parameters: [],
        });
      });
      expect(api.createDefinition).toHaveBeenCalledWith("line", {
        name: "Heater",
        version: "1.0",
        description: "d",
        abstract: "a",
        implementation: { program: "MainProgram" },
        parameters: [],
      });
    });

    test("Edit opens the modal with the definition and saves through updateDefinition", async () => {
      api.updateDefinition.mockResolvedValue(null);
      await renderTree();
      openMenuOn(row("cleaning"));
      await clickMenu(S.menu.edit);
      expect(createModalProps.initial).toMatchObject({ id: "cleaning" });
      await act(async () => {
        await createModalProps.onOk({
          name: "Cleaning",
          version: "2.0",
          desc: "",
          abstract: "",
          implementation: {},
          parameters: [],
        });
      });
      expect(api.updateDefinition).toHaveBeenCalledWith(
        "cleaning",
        expect.objectContaining({ version: "2.0" }),
      );
    });

    test("dragging a definition onto another moves it there", async () => {
      api.moveDefinition.mockResolvedValue(null);
      await renderTree();
      fireEvent.dragStart(row("cleaning"), {
        dataTransfer: { setData: jest.fn() },
      });
      expect(window._dragComponent).toMatchObject({
        kind: "userDefinition",
        id: "cleaning",
        basePath: [],
      });
      await act(async () => {
        fireEvent.drop(row("line"));
      });
      expect(api.moveDefinition).toHaveBeenCalledWith("cleaning", "line");
    });

    test("dropping a pre-defined element adds a reference child", async () => {
      api.addPredefinedChild.mockResolvedValue("ref");
      await renderTree();
      window._dragComponent = {
        kind: "predefined",
        predefinedKey: "pair:Mixing|Add Ingredient",
        label: "Mixing - Add Ingredient",
        procedurePhase: "Mixing",
        operation: "Add Ingredient",
      };
      await act(async () => {
        fireEvent.drop(row("cleaning"));
      });
      expect(api.addPredefinedChild).toHaveBeenCalledWith("cleaning", {
        key: "pair:Mixing|Add Ingredient",
        label: "Mixing - Add Ingredient",
        type: "Mixing - Add Ingredient",
        procedurePhase: "Mixing",
        operation: "Add Ingredient",
      });
    });

    test("Move up / Move down reorder within the parent", async () => {
      api.moveDefinition.mockResolvedValue(null);
      await renderTree();
      expand("line");
      openMenuOn(row("packer"));
      await clickMenu(S.menu.moveUp);
      expect(api.moveDefinition).toHaveBeenCalledWith("packer", "line", 0);
    });

    test("Delete with children offers both choices", async () => {
      api.deleteDefinition.mockResolvedValue(null);
      await renderTree();
      openMenuOn(row("line"));
      await clickMenu(S.menu.delete);
      const D = UI_STRINGS.dashboard.deleteDefinitionModal;
      expect(screen.getByText(D.deleteAll(4))).toBeInTheDocument();
      await act(async () => {
        fireEvent.click(screen.getByText(D.keepChildren));
      });
      expect(api.deleteDefinition).toHaveBeenCalledWith("line", true);
    });
  });

  describe("negative", () => {
    test("non-designers get no menu, no add button and can't drag", async () => {
      await renderTree(ROWS, { isDesigner: false });
      openMenuOn(row("line"));
      expect(screen.queryByRole("menu")).toBeNull();
      expect(screen.queryByRole("button", { name: S.menu.new })).toBeNull();
      expect(row("line")).toHaveAttribute("draggable", "false");
    });

    test("a server rule error is shown with its UI text", async () => {
      api.moveDefinition.mockRejectedValue(
        Object.assign(new Error("x"), {
          code: "failed-precondition",
          hint: "duplicate_sibling",
        }),
      );
      await renderTree();
      window._dragComponent = {
        kind: "userDefinition",
        id: "cleaning",
        definition: api.buildDefinitionTree(ROWS).byId.get("cleaning"),
      };
      await act(async () => {
        fireEvent.drop(row("line"));
      });
      expect(screen.getByRole("alert")).toHaveTextContent(
        S.errors.duplicateSibling,
      );
    });

    test("dropping a definition onto its own descendant does nothing", async () => {
      await renderTree();
      expand("line");
      fireEvent.dragStart(row("line"), {
        dataTransfer: { setData: jest.fn() },
      });
      await act(async () => {
        fireEvent.drop(row("mixer"));
      });
      expect(api.moveDefinition).not.toHaveBeenCalled();
    });

    test("canDropOn and definitionErrorText", () => {
      const { byId } = api.buildDefinitionTree([
        ...ROWS,
        def("ref", "line", "Ref", 2, {
          kind: "predefined",
          predefined: { key: "k", label: "Ref" },
        }),
      ]);
      const drag = { kind: "userDefinition", definition: byId.get("line") };
      expect(canDropOn(byId.get("cleaning"), drag)).toBe(true);
      expect(canDropOn(byId.get("dosing"), drag)).toBe(false);
      expect(canDropOn(byId.get("ref"), { kind: "predefined" })).toBe(false);
      expect(canDropOn(byId.get("line"), null)).toBe(false);
      expect(definitionErrorText({ hint: "cycle" })).toBe(S.errors.cycle);
      expect(definitionErrorText({ code: "permission-denied" })).toBe(
        S.errors.noPermission,
      );
      expect(definitionErrorText({ message: "boom" })).toBe("boom");
    });
  });

  describe("edge", () => {
    test("search shows a deep match with its ancestors, without expanding by hand", async () => {
      await renderTree(ROWS, { search: "dos" });
      expect(row("line")).toBeInTheDocument();
      expect(row("mixer")).toBeInTheDocument();
      expect(row("dosing")).toBeInTheDocument();
      expect(screen.queryByTestId("definition-row-cleaning")).toBeNull();
    });

    test("a pre-defined reference has no expander and no create or edit actions", async () => {
      await renderTree([
        def("p", null, "Parent"),
        def("ref", "p", "Mixing - Add Ingredient", 0, {
          kind: "predefined",
          predefined: { key: "k", label: "Mixing - Add Ingredient" },
        }),
      ]);
      expand("p");
      expect(row("ref")).toHaveTextContent(S.predefinedTag);
      openMenuOn(row("ref"));
      expect(
        screen.queryByRole("menuitem", { name: S.menu.newInside }),
      ).toBeNull();
      expect(screen.queryByRole("menuitem", { name: S.menu.edit })).toBeNull();
    });

    test("a 1,000-level chain renders and indentation stops growing after 8 levels", async () => {
      const chain = Array.from({ length: 1000 }, (_, i) =>
        def(`d${i}`, i === 0 ? null : `d${i - 1}`, `Level ${i + 1}`),
      );
      await renderTree(chain, { search: "Level 1000" });
      expect(row("d999")).toBeInTheDocument();
      expect(row("d999").style.marginLeft).toBe(row("d8").style.marginLeft);
      expect(row("d1").style.marginLeft).not.toBe(row("d8").style.marginLeft);
    });
  });
});
