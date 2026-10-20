"use client";

import { I18nProvider } from "@/lib/i18n";
import { useEffect, type ReactNode } from "react";
import { initAuth } from "@/lib/authState";
import { ThemeProvider } from "@/lib/theme";
import type { Locale } from "@/lib/localeConfig";

export default function Providers({ children, initialLocale, hasSavedLocale }: { children: ReactNode; initialLocale: Locale; hasSavedLocale: boolean }) {
  useEffect(() => { initAuth(); }, []);
  return <ThemeProvider><I18nProvider initialLocale={initialLocale} hasSavedLocale={hasSavedLocale}><div className="locale-content contents">{children}</div></I18nProvider></ThemeProvider>;
}
