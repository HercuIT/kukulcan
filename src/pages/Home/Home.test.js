import { render, screen, act } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { UI_STRINGS } from "../../constants/uiStrings";
import Home from "./Home";

jest.mock("../../backend/authApi", () => ({ signOut: jest.fn() }));

const S = UI_STRINGS.home.page;
const USER = { uid: "u-1", email: "designer@example.com" };
const ORIGINAL_ENV = process.env;

async function renderHome(userRoles = { designer: true }) {
  let utils;
  await act(async () => {
    utils = render(
      <MemoryRouter>
        <Home user={USER} userRoles={userRoles} />
      </MemoryRouter>,
    );
  });
  return utils;
}

beforeEach(() => {
  global.fetch = jest.fn();
  jest.spyOn(console, "error").mockImplementation(() => {});
  jest.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  process.env = ORIGINAL_ENV;
  jest.restoreAllMocks();
  delete global.fetch;
});

describe("Home local server check", () => {
  describe("positive", () => {
    test("is off by default: shows the page without calling localhost", async () => {
      process.env = {
        ...ORIGINAL_ENV,
        REACT_APP_LOCAL_SERVER_CHECK: undefined,
      };
      await renderHome();
      expect(
        screen.getByText(S.bienvenidoALaPaginaPrincipal),
      ).toBeInTheDocument();
      expect(global.fetch).not.toHaveBeenCalled();
    });

    test("when enabled and the server answers OK, shows the page", async () => {
      process.env = { ...ORIGINAL_ENV, REACT_APP_LOCAL_SERVER_CHECK: "true" };
      global.fetch.mockResolvedValue({ json: async () => ({ status: "OK" }) });
      await renderHome();
      expect(
        screen.getByText(S.bienvenidoALaPaginaPrincipal),
      ).toBeInTheDocument();
      expect(global.fetch).toHaveBeenCalledWith(
        "http://localhost:3001/api/health",
      );
    });
  });

  describe("negative", () => {
    test("when enabled and the server is down, shows the server dialog", async () => {
      process.env = { ...ORIGINAL_ENV, REACT_APP_LOCAL_SERVER_CHECK: "true" };
      global.fetch.mockRejectedValue(new TypeError("Failed to fetch"));
      await renderHome();
      expect(screen.getByText(S.elServidorLocalNoEsta)).toBeInTheDocument();
    });
  });

  describe("edge", () => {
    test("only the exact value 'true' enables it", async () => {
      process.env = { ...ORIGINAL_ENV, REACT_APP_LOCAL_SERVER_CHECK: "1" };
      await renderHome();
      expect(global.fetch).not.toHaveBeenCalled();
    });

    test("waits for the roles before showing the page", async () => {
      process.env = {
        ...ORIGINAL_ENV,
        REACT_APP_LOCAL_SERVER_CHECK: undefined,
      };
      await renderHome(null);
      expect(screen.getByText(S.loading)).toBeInTheDocument();
      expect(
        screen.queryByText(S.bienvenidoALaPaginaPrincipal),
      ).not.toBeInTheDocument();
    });
  });
});
