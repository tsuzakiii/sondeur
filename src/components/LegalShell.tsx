"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useI18n } from "@/lib/i18n";

/**
 * 法的ページ・静的ページの共通シェル。
 * neumorphism の読み物レイアウト + 相互リンクフッター。
 */
export default function LegalShell({ title, children }: { title: string; children: ReactNode }) {
  const { t } = useI18n();
  return (
    <div className="min-h-dvh w-full overflow-y-auto">
      <div className="mx-auto max-w-2xl px-6 py-12">
        <Link href="/" className="text-[13px] font-semibold text-navy transition-opacity hover:opacity-70">
          Sondeur
        </Link>
        <div className="neu-raised mt-4 rounded-2xl px-7 py-8 sm:px-9 sm:py-10">
          <h1 className="mb-6 text-lg font-bold text-navy">{title}</h1>
          <div className="legal-prose text-[13px] leading-7 text-slate-600">{children}</div>
        </div>
        <div className="mt-6 flex flex-wrap gap-x-4 gap-y-1.5 px-1 text-[11px] text-slate-400">
          <Link href="/about" className="transition-colors hover:text-slate-600">{t("legal.about")}</Link>
          <Link href="/legal/terms" className="transition-colors hover:text-slate-600">{t("legal.terms")}</Link>
          <Link href="/legal/privacy" className="transition-colors hover:text-slate-600">{t("legal.privacy")}</Link>
          <Link href="/legal/tokushoho" className="transition-colors hover:text-slate-600">{t("legal.tokushoho")}</Link>
          <Link href="/" className="transition-colors hover:text-slate-600">{t("legal.backHome")}</Link>
        </div>
      </div>
    </div>
  );
}

export function LegalSection({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <section className="mt-6 first:mt-0">
      <h2 className="mb-2 text-[14px] font-semibold text-slate-700">{heading}</h2>
      {children}
    </section>
  );
}
