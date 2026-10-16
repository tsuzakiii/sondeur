"use client";

import { I18nProvider } from "@/lib/i18n";
import { useEffect, type ReactNode } from "react";
import { initAuth } from "@/lib/authState";
import { ThemeProvider } from "@/lib/theme";

export default function Providers({ children }: { children: ReactNode }) {
  useEffect(() => { initAuth(); }, []);
  return <ThemeProvider><I18nProvider>{children}</I18nProvider></ThemeProvider>;
}
