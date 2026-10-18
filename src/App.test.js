import { render, screen, act } from "@testing-library/react";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import App from "./App";

jest.mock("./backend/firebaseConfig", () => ({ auth: {}, db: {} }));

jest.mock("firebase/auth", () => ({ onAuthStateChanged: jest.fn() }));

jest.mock("firebase/firestore", () => ({
  doc: jest.fn((db, collection, id) => ({ path: `${collection}/${id}` })),
  getDoc: jest.fn(),
}));

// Stub the pages so these tests cover App's auth and routing only.
jest.mock("./pages/Home/Home.js", () => ({ user, userRoles }) => (
  <div data-testid="home">
    Home {user.uid} {JSON.stringify(userRoles)}
  </div>
));
jest.mock("./pages/Dashboard/Dashboard.js", () => ({ user, userRoles }) => (
  <div data-testid="dashboard">
    Dashboard {user.uid} {JSON.stringify(userRoles)}
  </div>
));
jest.mock("./pages/Login/Login", () => () => (
  <div data-testid="login">Login</div>
));

const USER = { uid: "user-1", email: "designer@example.com" };

let authCallback;
let unsubscribe;

beforeEach(() => {
  jest.clearAllMocks();
  unsubscribe = jest.fn();
  onAuthStateChanged.mockImplementation((auth, callback) => {
    authCallback = callback;
    return unsubscribe;
  });
  window.history.pushState({}, "", "/");
});

const rolesDoc = (data) => ({
  exists: () => data !== null,
  data: () => data,
});

async function renderAt(path, currentUser) {
  window.history.pushState({}, "", path);
  const utils = render(<App />);
  await act(async () => {
    await authCallback(currentUser);
  });
  return utils;
}

describe("App", () => {
  describe("positive", () => {
    test("shows Home with the user's roles at / when signed in", async () => {
      getDoc.mockResolvedValue(rolesDoc({ designer: true, reviewer: false }));

      await renderAt("/", USER);

      expect(screen.getByTestId("home")).toHaveTextContent(
        'Home user-1 {"designer":true,"reviewer":false}',
      );
      expect(doc).toHaveBeenCalledWith({}, "roles", "user-1");
    });

    test("shows the Dashboard at /dashboard when signed in", async () => {
      getDoc.mockResolvedValue(rolesDoc({ designer: true }));

      await renderAt("/dashboard", USER);

      expect(screen.getByTestId("dashboard")).toHaveTextContent(
        'Dashboard user-1 {"designer":true}',
      );
      expect(screen.queryByTestId("home")).not.toBeInTheDocument();
    });
  });

  describe("negative", () => {
    test("shows Login when signed out", async () => {
      await renderAt("/", null);

      expect(screen.getByTestId("login")).toBeInTheDocument();
      expect(getDoc).not.toHaveBeenCalled();
    });

    test("does not expose the Dashboard when signed out", async () => {
      await renderAt("/dashboard", null);

      expect(screen.getByTestId("login")).toBeInTheDocument();
      expect(screen.queryByTestId("dashboard")).not.toBeInTheDocument();
    });

    test("falls back to Login when loading roles fails", async () => {
      const error = new Error("permission-denied");
      getDoc.mockRejectedValue(error);
      const consoleError = jest
        .spyOn(console, "error")
        .mockImplementation(() => {});

      await renderAt("/", USER);

      expect(screen.getByTestId("login")).toBeInTheDocument();
      expect(consoleError).toHaveBeenCalledWith(
        "Error al obtener datos del usuario:",
        error,
      );
      consoleError.mockRestore();
    });
  });

  describe("edge", () => {
    test("shows the loading state until auth resolves", () => {
      render(<App />);

      expect(screen.getByText("Cargando...")).toBeInTheDocument();
      expect(screen.queryByTestId("login")).not.toBeInTheDocument();
      expect(screen.queryByTestId("home")).not.toBeInTheDocument();
    });

    test("gives a user without a roles document empty roles", async () => {
      getDoc.mockResolvedValue(rolesDoc(null));

      await renderAt("/", USER);

      expect(screen.getByTestId("home")).toHaveTextContent("Home user-1 {}");
    });

    test("sends unknown routes to Home when signed in", async () => {
      getDoc.mockResolvedValue(rolesDoc({}));

      await renderAt("/does-not-exist", USER);

      expect(screen.getByTestId("home")).toBeInTheDocument();
    });

    test("returns to Login when the user signs out", async () => {
      getDoc.mockResolvedValue(rolesDoc({ designer: true }));
      await renderAt("/", USER);
      expect(screen.getByTestId("home")).toBeInTheDocument();

      await act(async () => {
        await authCallback(null);
      });

      expect(screen.getByTestId("login")).toBeInTheDocument();
    });

    test("unsubscribes from auth changes on unmount", async () => {
      const { unmount } = await renderAt("/", null);

      unmount();

      expect(unsubscribe).toHaveBeenCalledTimes(1);
    });
  });
});
