import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

// Tema claro u oscuro (HTE-111). El modo "system" sigue al sistema operativo en vivo; "light" y
// "dark" se guardan por navegador en localStorage. public/index.html aplica el mismo cálculo antes
// de que cargue React para que la página nunca parpadee con el tema equivocado.

export const THEME_STORAGE_KEY = "kukulcan.theme";
export const THEME_MODES = ["system", "light", "dark"];
const STORED_MODES = ["light", "dark"];
const DARK_QUERY = "(prefers-color-scheme: dark)";

// Lo guardado, o "system" si no hay nada, el valor no es válido o el almacenamiento falla
// (ventana privada, almacenamiento bloqueado).
export function readStoredMode() {
  try {
    const value = window.localStorage.getItem(THEME_STORAGE_KEY);
    return STORED_MODES.includes(value) ? value : "system";
  } catch {
    return "system";
  }
}

function writeStoredMode(mode) {
  try {
    if (mode === "system") window.localStorage.removeItem(THEME_STORAGE_KEY);
    else window.localStorage.setItem(THEME_STORAGE_KEY, mode);
  } catch {
    // Sin almacenamiento el cambio vale solo para esta sesión.
  }
}

function darkQuery() {
  return typeof window.matchMedia === "function"
    ? window.matchMedia(DARK_QUERY)
    : null;
}

export const systemTheme = () => (darkQuery()?.matches ? "dark" : "light");

// El color del navegador (meta theme-color) sigue al tema resuelto, también cuando el usuario
// eligió uno distinto del sistema: se copia --kk-raised (el color de la barra de menú) a todas las
// etiquetas. Sin hoja de estilos (p. ej. en pruebas) la variable está vacía y no se toca nada.
export function syncThemeColor() {
  const color = getComputedStyle(document.documentElement)
    .getPropertyValue("--kk-raised")
    .trim();
  if (!color) return;
  document
    .querySelectorAll('meta[name="theme-color"]')
    .forEach((tag) => tag.setAttribute("content", color));
}

const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {
  const [mode, setModeState] = useState(readStoredMode);
  const [osTheme, setOsTheme] = useState(systemTheme);

  // Sigue el cambio del sistema operativo mientras la app está abierta.
  useEffect(() => {
    const query = darkQuery();
    if (!query) return undefined;
    const onChange = (e) => setOsTheme(e.matches ? "dark" : "light");
    if (query.addEventListener) query.addEventListener("change", onChange);
    else query.addListener(onChange);
    return () => {
      if (query.removeEventListener)
        query.removeEventListener("change", onChange);
      else query.removeListener(onChange);
    };
  }, []);

  const resolvedTheme = mode === "system" ? osTheme : mode;

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", resolvedTheme);
    syncThemeColor();
  }, [resolvedTheme]);

  const setMode = useCallback((next) => {
    const value = THEME_MODES.includes(next) ? next : "system";
    writeStoredMode(value);
    setModeState(value);
  }, []);

  const value = useMemo(
    () => ({ mode, resolvedTheme, setMode }),
    [mode, resolvedTheme, setMode],
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

// Fuera de un ThemeProvider (p. ej. un componente probado solo) devuelve el tema claro sin efecto.
const FALLBACK = { mode: "system", resolvedTheme: "light", setMode: () => {} };

export function useTheme() {
  return useContext(ThemeContext) ?? FALLBACK;
}
