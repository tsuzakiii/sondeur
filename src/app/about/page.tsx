"use client";

import Link from "next/link";
import { useI18n, useLocale } from "@/lib/i18n";

/** サービス紹介 + 料金の静的ページ。共有ページ・検索流入の受け皿。 */

const CONTENT = {
  ja: {
    tagline: "わからないことを、わかるまで測深する。",
    intro:
      "Sondeur は、AI の説明の「わからない箇所」を選んで掘り下げる学習サービスです。文中の語句をなぞって What is it（それは何か）/ Why is it（なぜそうなのか）を選ぶと、そこから新しい説明が生え、探索の航跡が木構造として残ります。",
    stepsHeading: "使い方",
    steps: [
      { title: "問いを立てる", body: "知りたいことを入力すると、AI が説明を生成します。" },
      { title: "わからない箇所を選ぶ", body: "本文の語句をドラッグで選択し、What / Why で掘り下げます。" },
      { title: "航跡が残る", body: "掘った履歴は木構造として蓄積され、いつでも辿り直せます。" },
    ],
    pricingHeading: "料金",
    plans: [
      { name: "Free", price: "$0", detail: "20 ノード/月" },
      { name: "Standard", price: "$7/月", detail: "100 ノード/月" },
      { name: "Pro", price: "$14/月", detail: "300 ノード/月" },
    ],
    pricingNote: "ログイン不要のお試し枠もあります。表示価格は米ドル建てです。税金・為替手数料等が発生する場合があります。",
    cta: "使ってみる",
  },
  en: {
    tagline: "Sound the depths of understanding.",
    intro:
      "Sondeur is a learning tool for drilling into the parts of an AI explanation you don't understand. Select any phrase and choose What is it / Why is it — a new explanation grows from it, and your exploration accumulates as a tree.",
    stepsHeading: "How it works",
    steps: [
      { title: "Ask", body: "Type what you want to understand and the AI generates an explanation." },
      { title: "Select what's unclear", body: "Drag over any phrase and drill down with What / Why." },
      { title: "Keep the trail", body: "Your explorations accumulate as trees you can revisit anytime." },
    ],
    pricingHeading: "Pricing",
    plans: [
      { name: "Free", price: "$0", detail: "20 nodes/mo" },
      { name: "Standard", price: "$7/mo", detail: "100 nodes/mo" },
      { name: "Pro", price: "$14/mo", detail: "300 nodes/mo" },
    ],
    pricingNote: "You can also try it without signing in. Prices are in USD. Applicable taxes and currency fees may apply.",
    cta: "Try Sondeur",
  },
} as const;

export default function AboutPage() {
  const { t } = useI18n();
  const [locale] = useLocale();
  const c = CONTENT[locale] ?? CONTENT.en;

  return (
    <div className="min-h-dvh w-full overflow-y-auto">
      <div className="mx-auto max-w-2xl px-6 py-14">
        <h1 className="text-2xl font-bold tracking-tight text-navy">Sondeur</h1>
        <p className="mt-1.5 text-[14px] text-slate-500">{c.tagline}</p>

        <p className="mt-7 text-[13.5px] leading-7 text-slate-600">{c.intro}</p>

        <h2 className="mt-10 text-[15px] font-semibold text-slate-700">{c.stepsHeading}</h2>
        <ol className="mt-4 space-y-3">
          {c.steps.map((s, i) => (
            <li key={s.title} className="neu-flat flex items-start gap-4 rounded-xl px-5 py-4">
              <span className="mt-0.5 text-[13px] font-semibold text-navy">{i + 1}</span>
              <div>
                <div className="text-[13px] font-medium text-slate-700">{s.title}</div>
                <div className="mt-0.5 text-[12.5px] leading-6 text-slate-500">{s.body}</div>
              </div>
            </li>
          ))}
        </ol>

        <h2 className="mt-10 text-[15px] font-semibold text-slate-700">{c.pricingHeading}</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {c.plans.map((p) => (
            <div key={p.name} className="neu-raised-sm rounded-xl px-5 py-4">
              <div className="text-[13px] font-semibold text-navy">{p.name}</div>
              <div className="mt-1 text-[15px] font-medium text-slate-700">{p.price}</div>
              <div className="mt-0.5 text-[12px] text-slate-500">{p.detail}</div>
            </div>
          ))}
        </div>
        <p className="mt-3 text-[11.5px] text-slate-400">{c.pricingNote}</p>

        <Link
          href="/"
          className="neu-raised mt-10 inline-block rounded-xl bg-navy px-6 py-3 text-[13px] font-medium text-white transition-opacity hover:opacity-90"
        >
          {c.cta}
        </Link>

        <div className="mt-12 flex flex-wrap gap-x-4 gap-y-1.5 text-[11px] text-slate-400">
          <Link href="/legal/terms" className="transition-colors hover:text-slate-600">{t("legal.terms")}</Link>
          <Link href="/legal/privacy" className="transition-colors hover:text-slate-600">{t("legal.privacy")}</Link>
          <Link href="/legal/tokushoho" className="transition-colors hover:text-slate-600">{t("legal.tokushoho")}</Link>
        </div>
      </div>
    </div>
  );
}
