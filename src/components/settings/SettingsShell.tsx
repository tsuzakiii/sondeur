"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useI18n } from "@/lib/i18n";
import { useEffect, type ReactNode } from "react";
import { useAuthInfo, useAuthReady } from "@/lib/authState";

export default function SettingsShell({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const path = usePathname();
  const router = useRouter();
  const auth = useAuthInfo();
  const ready = useAuthReady();
  const restricted = path === "/settings/account" || path === "/settings/billing";
  const needsLogin = restricted && auth.kind !== "signedIn";
  useEffect(() => {
    if (ready && needsLogin) router.replace("/login");
  }, [ready, needsLogin, router]);
  if (needsLogin) return <div className="m-auto p-8 text-sm text-slate-500" role="status">{t("settings.loading")}</div>;
  const sections = auth.kind === "signedIn" ? ["general", "billing", "account"] as const : ["general"] as const;
  return <div className="mx-auto w-full max-w-6xl px-5 py-7 sm:px-10 sm:py-10">
    <header className="mb-8 flex items-center justify-between gap-4">
      <Link href="/" className="flex items-center gap-2 font-semibold tracking-wide"><span className="h-2 w-2 rounded-full bg-navy" />Sondeur</Link>
      <Link href="/" className="text-sm text-slate-500 hover:text-navy">← {t("settings.back")}</Link>
    </header>
    <h1 className="mb-8 text-3xl font-semibold tracking-tight">{t("settings.title")}</h1>
    <div className="grid gap-8 md:grid-cols-[210px_minmax(0,1fr)] md:gap-12">
      <nav aria-label={t("settings.title")} className="navigation-surface flex flex-wrap gap-2 self-start rounded-xl p-3 md:sticky md:top-8 md:flex-col">
        {sections.map((section) => <Link key={section} href={`/settings/${section}`} aria-current={path === `/settings/${section}` ? "page" : undefined} className="navigation-item flex items-center gap-3 rounded-lg px-4 py-3 text-sm">{t(`settings.${section}`)}</Link>)}
      </nav>
      <main className="min-w-0 pb-10">{children}</main>
    </div>
  </div>;
}
export function SettingsHeading({ section }: { section: "general" | "billing" | "account" }) {
  const { t } = useI18n();
  return <div className="mb-7"><h2 className="text-xl font-semibold">{t(`settings.${section}`)}</h2><p className="mt-2 text-sm leading-6 text-slate-500">{t(`settings.${section}Intro`)}</p></div>;
}
