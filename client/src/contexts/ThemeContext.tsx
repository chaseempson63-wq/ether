import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

export type EtherTheme = "day" | "night";

interface ThemeContextType {
  theme: EtherTheme;
  setTheme: (t: EtherTheme) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const STORAGE_KEY = "ether:theme";
const DEFAULT_THEME: EtherTheme = "night";

// Ether theme provider. Persists the user's choice to localStorage, no
// system-preference detection — we load whatever the user last set and
// fall back to night on first visit. A `.day` class on <html> toggles the
// light-mode CSS overrides in index.css.
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<EtherTheme>(() => {
    if (typeof window === "undefined") return DEFAULT_THEME;
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return stored === "day" || stored === "night" ? stored : DEFAULT_THEME;
  });

  useEffect(() => {
    const root = document.documentElement;
    if (theme === "day") root.classList.add("day");
    else root.classList.remove("day");
    try {
      window.localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      /* ignore storage errors */
    }
  }, [theme]);

  const setTheme = useCallback((next: EtherTheme) => setThemeState(next), []);
  const toggleTheme = useCallback(
    () => setThemeState((prev) => (prev === "day" ? "night" : "day")),
    [],
  );

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
