import { render, screen, fireEvent, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { UI_STRINGS } from "../../constants/uiStrings";
import { ThemeProvider, THEME_STORAGE_KEY } from "../../theme/ThemeContext";
import { MenuBar } from "./Dashboard";

jest.mock("../../backend/authApi", () => ({
  onSessionChange: jest.fn(() => () => {}),
  signOut: jest.fn(),
}));
jest.mock("../../backend/workflowsApi", () => ({}));
jest.mock("react-selecto", () => () => null);

const M = UI_STRINGS.dashboard.menuBar;
const LABEL = {
  light: M.menuLabels["Light Theme"],
  dark: M.menuLabels["Dark Theme"],
  system: M.menuLabels["System Theme"],
};

function renderMenu(props = {}) {
  return render(
    <MemoryRouter>
      <ThemeProvider>
        <MenuBar user={{ email: "d@example.com" }} isDesigner {...props} />
      </ThemeProvider>
    </MemoryRouter>,
  );
}

const openView = () =>
  fireEvent.click(screen.getByText(M.menuLabels.View ?? "View"));
const option = (label) => screen.getByText(label).closest(".dropdown-option");

beforeEach(() => {
  jest.spyOn(window, "alert").mockImplementation(() => {});
});

afterEach(() => {
  window.localStorage.clear();
  document.documentElement.removeAttribute("data-theme");
  jest.restoreAllMocks();
});

describe("MenuBar theme options (HTE-111)", () => {
  describe("positive", () => {
    test("shows the Kukulcan lockup linking home", () => {
      renderMenu();
      expect(
        screen.getByRole("link", { name: UI_STRINGS.components.logo.homeLink }),
      ).toHaveAttribute("href", "/");
    });

    test("View lists the three theme options, system marked active by default", () => {
      renderMenu();
      openView();
      for (const label of Object.values(LABEL)) {
        expect(option(label)).toHaveAttribute("role", "menuitemradio");
      }
      expect(option(LABEL.system)).toHaveAttribute("aria-checked", "true");
      expect(
        within(option(LABEL.system)).getByText(M.activeOption),
      ).toHaveClass("visually-hidden");
      expect(option(LABEL.dark)).toHaveAttribute("aria-checked", "false");
    });

    test("choosing Dark applies and saves it, and marks it active next time", () => {
      renderMenu();
      openView();
      fireEvent.click(option(LABEL.dark));
      expect(document.documentElement).toHaveAttribute("data-theme", "dark");
      expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
      expect(window.alert).not.toHaveBeenCalled();
      openView();
      expect(option(LABEL.dark)).toHaveAttribute("aria-checked", "true");
      expect(option(LABEL.system)).toHaveAttribute("aria-checked", "false");
    });
  });

  describe("negative", () => {
    test("other View options keep their old behaviour and no radio role", () => {
      renderMenu();
      openView();
      const zoom = option(M.menuLabels["Zoom In"] ?? "Zoom In");
      expect(zoom).toHaveAttribute("role", "menuitem");
      expect(zoom).not.toHaveAttribute("aria-checked");
      fireEvent.click(zoom);
      expect(window.alert).toHaveBeenCalled();
    });
  });

  describe("keyboard", () => {
    test("theme options are focusable and Enter or Space applies them", () => {
      renderMenu();
      openView();
      const dark = option(LABEL.dark);
      expect(dark).toHaveAttribute("tabindex", "0");
      dark.focus();
      expect(dark).toHaveFocus();
      fireEvent.keyDown(dark, { key: "Enter" });
      expect(document.documentElement).toHaveAttribute("data-theme", "dark");
      openView();
      fireEvent.keyDown(option(LABEL.light), { key: " " });
      expect(document.documentElement).toHaveAttribute("data-theme", "light");
    });

    test("other keys do nothing", () => {
      renderMenu();
      openView();
      fireEvent.keyDown(option(LABEL.dark), { key: "a" });
      expect(document.documentElement).not.toHaveAttribute(
        "data-theme",
        "dark",
      );
      expect(option(LABEL.system)).toHaveAttribute("aria-checked", "true");
    });
  });

  describe("edge", () => {
    test("only one option is ever marked active", () => {
      window.localStorage.setItem(THEME_STORAGE_KEY, "light");
      renderMenu();
      openView();
      const checked = Object.values(LABEL).filter(
        (label) => option(label).getAttribute("aria-checked") === "true",
      );
      expect(checked).toEqual([LABEL.light]);
      expect(screen.getAllByText(M.activeOption)).toHaveLength(1);
    });
  });
});
