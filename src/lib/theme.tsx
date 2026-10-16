"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { normalizeTheme, resolveTheme, THEME_KEY, type Theme } from "./themeConfig";
export type { Theme } from "./themeConfig";
const ThemeContext = createContext<{ theme: Theme; setTheme: (t: Theme) => void }>({ theme: "system", setTheme: () => {} });
function apply(theme: Theme) {
  document.documentElement.dataset.theme = resolveTheme(theme, window.matchMedia("(prefers-color-scheme: dark)").matches);
}
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setValue] = useState<Theme>("system");
  const currentTheme = useRef<Theme>("system");
  useEffect(() => {
    let current: Theme = "system";
    try { current = normalizeTheme(localStorage.getItem(THEME_KEY)); } catch {}
    currentTheme.current = current;
    apply(current);
    const timer = window.setTimeout(() => setValue(current), 0);
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onSystem = () => apply(currentTheme.current);
    const onStorage = (event: StorageEvent) => {
      if (event.key !== THEME_KEY && event.key !== null) return;
      current = normalizeTheme(event.newValue);
      currentTheme.current = current;
      setValue(current); apply(current);
    };
    media.addEventListener("change", onSystem);
    window.addEventListener("storage", onStorage);
    return () => {
      window.clearTimeout(timer);
      media.removeEventListener("change", onSystem);
      window.removeEventListener("storage", onStorage);
    };
  }, []);
  function setTheme(next: Theme) {
    currentTheme.current = next;
    setValue(next); apply(next);
    try { localStorage.setItem(THEME_KEY, next); } catch {}
  }
  return <ThemeContext.Provider value={{ theme, setTheme }}>{children}</ThemeContext.Provider>;
}
export const useTheme = () => useContext(ThemeContext);
