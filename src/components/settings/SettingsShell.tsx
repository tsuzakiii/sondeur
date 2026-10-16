"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useI18n } from "@/lib/i18n";
import type { ReactNode } from "react";

export default function SettingsShell({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const path = usePathname();
  return <div className="mx-auto w-full max-w-6xl px-5 py-7 sm:px-10 sm:py-10">
    <header className="mb-8 flex items-center justify-between gap-4">
      <Link href="/" className="flex items-center gap-2 font-semibold tracking-wide"><span className="h-2 w-2 rounded-full bg-navy" />Sondeur</Link>
      <Link href="/" className="text-sm text-slate-500 hover:text-navy">← {t("settings.back")}</Link>
    </header>
    <h1 className="mb-8 text-3xl font-semibold tracking-tight">{t("settings.title")}</h1>
    <div className="grid gap-8 md:grid-cols-[210px_minmax(0,1fr)] md:gap-12">
      <nav aria-label={t("settings.title")} className="flex flex-wrap gap-2 self-start md:sticky md:top-8 md:flex-col">
        {(["general", "billing", "account"] as const).map((section, index) => <Link key={section} href={`/settings/${section}`} aria-current={path === `/settings/${section}` ? "page" : undefined} className={`flex items-center gap-3 rounded-xl px-4 py-3 text-sm ${path === `/settings/${section}` ? "bg-surface font-semibold text-navy" : "text-slate-500 hover:bg-hover"}`}><span aria-hidden="true" className="text-xs opacity-50">0{index + 1}</span>{t(`settings.${section}`)}</Link>)}
      </nav>
      <main className="min-w-0 pb-10">{children}</main>
    </div>
  </div>;
}
export function SettingsHeading({ section }: { section: "general" | "billing" | "account" }) {
  const { t } = useI18n();
  return <div className="mb-7"><h2 className="text-xl font-semibold">{t(`settings.${section}`)}</h2><p className="mt-2 text-sm leading-6 text-slate-500">{t(`settings.${section}Intro`)}</p></div>;
}
