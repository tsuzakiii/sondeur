export type Theme = "system" | "light" | "dark";
export const THEME_KEY = "sondeur.theme";
export function normalizeTheme(value: string | null): Theme {
  return value === "light" || value === "dark" ? value : "system";
}
export function resolveTheme(theme: Theme, prefersDark: boolean): "light" | "dark" {
  return theme === "system" ? (prefersDark ? "dark" : "light") : theme;
}
// Runs before the first paint. Storage may be unavailable in restricted browsers.
export const THEME_INIT_SCRIPT = `(function(){var t='system';try{var v=localStorage.getItem('${THEME_KEY}');if(v==='dark'||v==='light')t=v;}catch(e){}document.documentElement.dataset.theme=t==='system'?(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'):t;})();`;
