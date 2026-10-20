export type Locale = "en" | "ja";
export const LOCALE_COOKIE = "sondeur_locale";
export const LOCALE_STORAGE = "sondeur.locale";

export function validLocale(value: unknown): Locale | null {
  return value === "en" || value === "ja" ? value : null;
}

/** A saved choice wins; otherwise respect the browser's language priorities. */
export function initialRequestLocale(saved: unknown, acceptLanguage: string | null): Locale {
  const choice = validLocale(saved);
  if (choice) return choice;
  const languages = (acceptLanguage ?? "").split(",").map(part => {
    const [tag, ...params] = part.trim().toLowerCase().split(";");
    const quality = params.find(p => p.trim().startsWith("q="));
    return { language: validLocale(tag.split("-")[0]), q: quality ? Number(quality.trim().slice(2)) : 1 };
  }).filter(item => item.language && item.q > 0 && item.q <= 1).sort((a, b) => b.q - a.q);
  return languages[0]?.language ?? "en";
}

/** Old installations only have localStorage. Hide a mismatched translation until hydration restores it. */
export function localeBootstrapScript(hasSavedLocale: boolean) {
  return hasSavedLocale ? "" : `(function(){try{var l=localStorage.getItem('${LOCALE_STORAGE}');if((l==='ja'||l==='en')&&l!==document.documentElement.lang)document.documentElement.dataset.localePending=l;}catch(e){}})();`;
}

export function persistLocale(locale: Locale) {
  try { window.localStorage.setItem(LOCALE_STORAGE, locale); } catch {}
  try {
    document.cookie = `${LOCALE_COOKIE}=${locale}; Path=/; Max-Age=31536000; SameSite=Lax${window.location.protocol === "https:" ? "; Secure" : ""}`;
  } catch {}
}
