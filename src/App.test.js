import { render, screen, act } from "@testing-library/react";
import { getMyRoles, onSessionChange } from "./backend/authApi";
import App from "./App";

jest.mock("./backend/authApi", () => ({
  onSessionChange: jest.fn(),
  getMyRoles: jest.fn(),
}));

// Stub the pages so these tests cover App's auth and routing only.
jest.mock("./pages/Home/Home.js", () => {
  const Home = ({ user, userRoles }) => (
    <div data-testid="home">
      Home {user.uid} {JSON.stringify(userRoles)}
    </div>
  );
  return Home;
});
jest.mock("./pages/Dashboard/Dashboard.js", () => {
  const Dashboard = ({ user, userRoles }) => (
    <div data-testid="dashboard">
      Dashboard {user.uid} {JSON.stringify(userRoles)}
    </div>
  );
  return Dashboard;
});
jest.mock("./pages/SetPassword/SetPassword", () => {
  const SetPassword = () => <div data-testid="set-password">SetPassword</div>;
  return SetPassword;
});
jest.mock("./pages/Login/Login", () => {
  const Login = () => <div data-testid="login">Login</div>;
  return Login;
});

const USER = { uid: "user-1", email: "designer@example.com" };

let authCallback;
let unsubscribe;

beforeEach(() => {
  jest.clearAllMocks();
  unsubscribe = jest.fn();
  onSessionChange.mockImplementation((callback) => {
    authCallback = callback;
    return unsubscribe;
  });
  window.history.pushState({}, "", "/");
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
      getMyRoles.mockResolvedValue({ designer: true, reviewer: false });

      await renderAt("/", USER);

      expect(screen.getByTestId("home")).toHaveTextContent(
        'Home user-1 {"designer":true,"reviewer":false}',
      );
      expect(getMyRoles).toHaveBeenCalledWith("user-1");
    });

    test("shows the Dashboard at /dashboard when signed in", async () => {
      getMyRoles.mockResolvedValue({ designer: true });

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
      expect(getMyRoles).not.toHaveBeenCalled();
    });

    test("does not expose the Dashboard when signed out", async () => {
      await renderAt("/dashboard", null);

      expect(screen.getByTestId("login")).toBeInTheDocument();
      expect(screen.queryByTestId("dashboard")).not.toBeInTheDocument();
    });

    test("falls back to Login when loading roles fails", async () => {
      const error = new Error("permission-denied");
      getMyRoles.mockRejectedValue(error);
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

    test("gives a user without a profile empty roles", async () => {
      getMyRoles.mockResolvedValue({});

      await renderAt("/", USER);

      expect(screen.getByTestId("home")).toHaveTextContent("Home user-1 {}");
    });

    test("sends unknown routes to Home when signed in", async () => {
      getMyRoles.mockResolvedValue({});

      await renderAt("/does-not-exist", USER);

      expect(screen.getByTestId("home")).toBeInTheDocument();
    });

    test("returns to Login when the user signs out", async () => {
      getMyRoles.mockResolvedValue({ designer: true });
      await renderAt("/", USER);
      expect(screen.getByTestId("home")).toBeInTheDocument();

      await act(async () => {
        await authCallback(null);
      });

      expect(screen.getByTestId("login")).toBeInTheDocument();
    });

    test("the recovery link opens the set-password page when signed in", async () => {
      getMyRoles.mockResolvedValue({});

      await renderAt("/set-password", USER);

      expect(screen.getByTestId("set-password")).toBeInTheDocument();
    });

    test("an expired recovery link (no session) shows Login", async () => {
      await renderAt("/set-password", null);

      expect(screen.getByTestId("login")).toBeInTheDocument();
      expect(screen.queryByTestId("set-password")).not.toBeInTheDocument();
    });

    test("a slow role lookup for a previous account doesn't overwrite the new one", async () => {
      let resolveFirst;
      getMyRoles
        .mockImplementationOnce(
          () => new Promise((resolve) => (resolveFirst = resolve)),
        )
        .mockResolvedValueOnce({ deployer: true });

      window.history.pushState({}, "", "/");
      render(<App />);
      await act(async () => {
        authCallback({ uid: "user-a", email: "a@example.com" });
        await authCallback({ uid: "user-b", email: "b@example.com" });
      });
      await act(async () => {
        resolveFirst({ designer: true });
      });

      expect(screen.getByTestId("home")).toHaveTextContent(
        'Home user-b {"deployer":true}',
      );
    });

    test("unsubscribes from auth changes on unmount", async () => {
      const { unmount } = await renderAt("/", null);

      unmount();

      expect(unsubscribe).toHaveBeenCalledTimes(1);
    });
  });
});
