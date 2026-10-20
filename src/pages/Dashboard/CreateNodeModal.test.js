import { render, screen, fireEvent } from "@testing-library/react";
import { UI_STRINGS } from "../../constants/uiStrings";
import { CreateNodeModal, parseBool } from "./Dashboard";

jest.mock("../../backend/supabaseClient", () => ({ supabase: {} }));
jest.mock("../../backend/authApi", () => ({
  onSessionChange: jest.fn(() => () => {}),
  signOut: jest.fn(),
}));
jest.mock("../../backend/workflowsApi", () => ({}));
jest.mock("react-selecto", () => () => null);

const C = UI_STRINGS.dashboard.createNodeModal;

const DEFINITION = {
  id: "d1",
  name: "Heater",
  version: "1.0",
  description: "Heats",
  abstract: "Heat",
  implementation: { program: "MainProgram", routine: "SFC_Control_Routine" },
  parameters: [],
};

function renderModal(initial) {
  const onOk = jest.fn();
  render(
    <CreateNodeModal open onClose={jest.fn()} onOk={onOk} initial={initial} />,
  );
  return onOk;
}

const ok = () => fireEvent.click(screen.getByRole("button", { name: C.ok }));

describe("CreateNodeModal (edit mode)", () => {
  describe("positive", () => {
    test("a definition with no parameters saves without adding a blank one", () => {
      const onOk = renderModal(DEFINITION);
      expect(
        screen.getByText(C.noParametersUseAddParameter),
      ).toBeInTheDocument();
      ok();
      expect(onOk).toHaveBeenCalledWith(
        expect.objectContaining({ name: "Heater", parameters: [] }),
      );
    });

    test("a BOOL default of false stays false (unchecked) and is saved as false", () => {
      const onOk = renderModal({
        ...DEFINITION,
        parameters: [{ name: "On", dataType: "BOOL", defaultValue: false }],
      });
      expect(screen.getByRole("checkbox")).not.toBeChecked();
      ok();
      expect(onOk.mock.calls[0][0].parameters).toEqual([
        { name: "On", dataType: "BOOL", defaultValue: false },
      ]);
    });

    test("a BOOL default of true stays true", () => {
      const onOk = renderModal({
        ...DEFINITION,
        parameters: [{ name: "On", dataType: "BOOL", defaultValue: true }],
      });
      expect(screen.getByRole("checkbox")).toBeChecked();
      ok();
      expect(onOk.mock.calls[0][0].parameters[0].defaultValue).toBe(true);
    });
  });

  describe("negative", () => {
    test("creating still requires description and abstract", () => {
      const onOk = renderModal(null);
      fireEvent.change(screen.getByPlaceholderText(C.enterNodeName), {
        target: { value: "New" },
      });
      fireEvent.click(screen.getByTitle(C.delete));
      ok();
      expect(onOk).not.toHaveBeenCalled();
      expect(
        screen.getByText(C.errors.porFavorCompletaTodosLos),
      ).toBeInTheDocument();
    });

    test("editing still requires a name", () => {
      const onOk = renderModal({ ...DEFINITION, name: "" });
      ok();
      expect(onOk).not.toHaveBeenCalled();
    });
  });

  describe("edge", () => {
    test("a definition saved without description or abstract (null) can be edited", () => {
      const onOk = renderModal({
        ...DEFINITION,
        description: null,
        abstract: null,
      });
      ok();
      expect(onOk).toHaveBeenCalledWith(
        expect.objectContaining({ desc: "", abstract: "" }),
      );
    });

    test("malformed stored parameters (not a list) open as an empty list", () => {
      const onOk = renderModal({ ...DEFINITION, parameters: { name: "x" } });
      ok();
      expect(onOk.mock.calls[0][0].parameters).toEqual([]);
    });

    test("parseBool accepts booleans and legacy strings only", () => {
      expect(parseBool(true)).toBe(true);
      expect(parseBool("true")).toBe(true);
      expect(parseBool(" TRUE ")).toBe(true);
      expect(parseBool(false)).toBe(false);
      expect(parseBool("false")).toBe(false);
      expect(parseBool("")).toBe(false);
      expect(parseBool(undefined)).toBe(false);
      expect(parseBool(1)).toBe(false);
    });
  });
});
