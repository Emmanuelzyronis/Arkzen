"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

export type Theme = "light" | "dark";

export const THEME_STORAGE_KEY = "arkzen-theme";

/**
 * Runs before paint so the first frame is already in the right theme. Kept as a
 * string because it has to execute ahead of React.
 */
export const themeInitScript = `
(function () {
  try {
    var stored = localStorage.getItem("${THEME_STORAGE_KEY}");
    var dark = stored ? stored === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches;
    document.documentElement.classList.toggle("dark", dark);
    document.documentElement.style.colorScheme = dark ? "dark" : "light";
  } catch (error) {}
})();
`;

const ThemeContext = createContext<{ theme: Theme; setTheme: (theme: Theme) => void }>({
  theme: "dark",
  setTheme: () => undefined,
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("dark");
  // Whether the stored choice has been read yet. Until it has, `theme` is only
  // the default, and the effect below must not act on it.
  const [resolved, setResolved] = useState(false);

  useEffect(() => {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    const initial: Theme =
      stored === "light" || stored === "dark"
        ? stored
        : window.matchMedia("(prefers-color-scheme: dark)").matches
          ? "dark"
          : "light";
    setThemeState(initial);
    setResolved(true);
  }, []);

  useEffect(() => {
    // Nothing may touch the document or the stored value until the real choice
    // is known. `themeInitScript` has already set both, before paint, from the
    // same storage key — so an effect that ran on the first commit would apply
    // and persist the *default* over the user's choice. Under StrictMode, whose
    // mount effects run twice, the re-run then reads that default back and the
    // chosen theme is lost for good; without it, the page flashes the wrong
    // theme on every load. Gating on `resolved` is what makes this idempotent.
    if (!resolved) return;
    const root = document.documentElement;
    root.classList.toggle("dark", theme === "dark");
    root.style.colorScheme = theme;
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme, resolved]);

  const setTheme = useCallback((next: Theme) => setThemeState(next), []);
  const value = useMemo(() => ({ theme, setTheme }), [theme, setTheme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}
