import { render, screen, act } from "@testing-library/react";
import {
  THEME_STORAGE_KEY,
  ThemeProvider,
  readStoredMode,
  syncThemeColor,
  systemTheme,
  useTheme,
} from "./ThemeContext";

// jsdom no trae matchMedia: un doble que permite simular el cambio del sistema operativo.
function mockMatchMedia(initialDark) {
  const listeners = new Set();
  const query = {
    matches: initialDark,
    addEventListener: (_, fn) => listeners.add(fn),
    removeEventListener: (_, fn) => listeners.delete(fn),
  };
  window.matchMedia = jest.fn(() => query);
  return {
    setDark(dark) {
      query.matches = dark;
      listeners.forEach((fn) => fn({ matches: dark }));
    },
    listeners,
  };
}

function Probe() {
  const { mode, resolvedTheme, setMode } = useTheme();
  return (
    <div>
      <span data-testid="mode">{mode}</span>
      <span data-testid="resolved">{resolvedTheme}</span>
      <button onClick={() => setMode("dark")}>dark</button>
      <button onClick={() => setMode("light")}>light</button>
      <button onClick={() => setMode("system")}>system</button>
      <button onClick={() => setMode("purple")}>bogus</button>
    </div>
  );
}

const renderProbe = () =>
  render(
    <ThemeProvider>
      <Probe />
    </ThemeProvider>,
  );

afterEach(() => {
  window.localStorage.clear();
  delete window.matchMedia;
  document.documentElement.removeAttribute("data-theme");
  jest.restoreAllMocks();
});

describe("ThemeProvider", () => {
  describe("positive", () => {
    test("defaults to system mode and follows the OS theme", () => {
      mockMatchMedia(true);
      renderProbe();
      expect(screen.getByTestId("mode")).toHaveTextContent("system");
      expect(screen.getByTestId("resolved")).toHaveTextContent("dark");
      expect(document.documentElement).toHaveAttribute("data-theme", "dark");
    });

    test("choosing dark or light sets data-theme and saves it per browser", () => {
      mockMatchMedia(false);
      renderProbe();
      act(() => screen.getByText("dark").click());
      expect(document.documentElement).toHaveAttribute("data-theme", "dark");
      expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
      act(() => screen.getByText("light").click());
      expect(document.documentElement).toHaveAttribute("data-theme", "light");
      expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");
    });

    test("a saved choice is restored on the next load", () => {
      mockMatchMedia(false);
      window.localStorage.setItem(THEME_STORAGE_KEY, "dark");
      renderProbe();
      expect(screen.getByTestId("mode")).toHaveTextContent("dark");
      expect(document.documentElement).toHaveAttribute("data-theme", "dark");
    });

    test("system mode tracks an OS change live and clears the saved choice", () => {
      const os = mockMatchMedia(false);
      window.localStorage.setItem(THEME_STORAGE_KEY, "light");
      renderProbe();
      act(() => screen.getByText("system").click());
      expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();
      act(() => os.setDark(true));
      expect(document.documentElement).toHaveAttribute("data-theme", "dark");
    });
  });

  describe("negative", () => {
    test("an invalid stored value is treated as system", () => {
      window.localStorage.setItem(THEME_STORAGE_KEY, "sepia");
      expect(readStoredMode()).toBe("system");
    });

    test("an invalid mode passed to setMode falls back to system", () => {
      mockMatchMedia(false);
      window.localStorage.setItem(THEME_STORAGE_KEY, "dark");
      renderProbe();
      act(() => screen.getByText("bogus").click());
      expect(screen.getByTestId("mode")).toHaveTextContent("system");
      expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();
    });

    test("blocked storage does not break reading or switching", () => {
      mockMatchMedia(false);
      jest.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
        throw new Error("blocked");
      });
      jest.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
        throw new Error("blocked");
      });
      expect(readStoredMode()).toBe("system");
      renderProbe();
      act(() => screen.getByText("dark").click());
      expect(document.documentElement).toHaveAttribute("data-theme", "dark");
    });

    test("without matchMedia the system theme is light", () => {
      expect(systemTheme()).toBe("light");
      renderProbe();
      expect(screen.getByTestId("resolved")).toHaveTextContent("light");
    });
  });

  describe("edge", () => {
    test("useTheme outside a provider returns a harmless light fallback", () => {
      render(<Probe />);
      expect(screen.getByTestId("mode")).toHaveTextContent("system");
      expect(screen.getByTestId("resolved")).toHaveTextContent("light");
      act(() => screen.getByText("dark").click());
      expect(document.documentElement).not.toHaveAttribute("data-theme");
    });

    test("unmounting removes the OS listener", () => {
      const os = mockMatchMedia(false);
      const { unmount } = renderProbe();
      expect(os.listeners.size).toBe(1);
      unmount();
      expect(os.listeners.size).toBe(0);
    });

    test("supports the legacy addListener API", () => {
      const query = {
        matches: true,
        addListener: jest.fn(),
        removeListener: jest.fn(),
      };
      window.matchMedia = jest.fn(() => query);
      const { unmount } = renderProbe();
      expect(query.addListener).toHaveBeenCalledTimes(1);
      const onChange = query.addListener.mock.calls[0][0];
      expect(typeof onChange).toBe("function");
      expect(screen.getByTestId("resolved")).toHaveTextContent("dark");
      // El callback registrado es el que actualiza el tema.
      act(() => onChange({ matches: false }));
      expect(screen.getByTestId("resolved")).toHaveTextContent("light");
      expect(document.documentElement).toHaveAttribute("data-theme", "light");
      unmount();
      expect(query.removeListener).toHaveBeenCalledWith(onChange);
    });
  });
});

describe("syncThemeColor (browser chrome color)", () => {
  // Dos etiquetas por esquema, como en public/index.html.
  function addThemeColorTags() {
    for (const media of ["light", "dark"]) {
      const tag = document.createElement("meta");
      tag.name = "theme-color";
      tag.setAttribute("media", `(prefers-color-scheme: ${media})`);
      tag.content = `initial-${media}`;
      document.head.appendChild(tag);
    }
    return () =>
      document
        .querySelectorAll('meta[name="theme-color"]')
        .forEach((t) => t.remove());
  }
  const contents = () =>
    [...document.querySelectorAll('meta[name="theme-color"]')].map(
      (t) => t.content,
    );

  afterEach(() => {
    document.documentElement.style.removeProperty("--kk-raised");
  });

  test("positive: copies the resolved theme's --kk-raised to every tag", () => {
    const cleanup = addThemeColorTags();
    document.documentElement.style.setProperty("--kk-raised", "token-dark");
    syncThemeColor();
    expect(contents()).toEqual(["token-dark", "token-dark"]);
    cleanup();
  });

  test("positive: an explicit choice updates the tags even against the OS", () => {
    const cleanup = addThemeColorTags();
    mockMatchMedia(false);
    document.documentElement.style.setProperty("--kk-raised", "token-now");
    renderProbe();
    act(() => screen.getByText("dark").click());
    expect(contents()).toEqual(["token-now", "token-now"]);
    cleanup();
  });

  test("negative: without the theme stylesheet the tags are left alone", () => {
    const cleanup = addThemeColorTags();
    syncThemeColor();
    expect(contents()).toEqual(["initial-light", "initial-dark"]);
    cleanup();
  });

  test("edge: no theme-color tags is fine", () => {
    document.documentElement.style.setProperty("--kk-raised", "x");
    expect(() => syncThemeColor()).not.toThrow();
  });
});
