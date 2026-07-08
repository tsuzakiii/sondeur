"use client";

import LegalShell from "@/components/LegalShell";

/**
 * 特定商取引法に基づく表記。日本法上の開示義務なので言語切替に関わらず日本語で表示する。
 * 【】のプレースホルダは公開前に運営者本人が埋めること。
 * 住所・電話番号は消費者庁ガイドラインに基づき、請求時に遅滞なく開示する方式。
 */

const ROWS: { label: string; value: string }[] = [
  { label: "販売事業者", value: "【運営者氏名】" },
  { label: "運営統括責任者", value: "【運営者氏名】" },
  { label: "所在地", value: "法令に基づき、取引時にご請求があった場合には遅滞なく開示いたします" },
  {
    label: "電話番号",
    value:
      "法令に基づき、取引時にご請求があった場合には遅滞なく開示いたします（お問い合わせは下記メールアドレスへお願いします）",
  },
  { label: "メールアドレス", value: "【連絡先メールアドレス】" },
  { label: "販売URL", value: "https://sondeur.vercel.app" },
  { label: "販売価格", value: "Standard プラン: 月額980円（税込） / Pro プラン: 月額1,980円（税込）" },
  {
    label: "商品代金以外の必要料金",
    value: "ありません。ただし、インターネット接続に伴う通信費はお客様のご負担となります",
  },
  { label: "申込期間", value: "申込期間の定めはありません" },
  {
    label: "利用制限",
    value:
      "Free プラン: 30ノード/月 / Standard プラン: 500ノード/月 / Pro プラン: ノード無制限（不正利用または過剰利用が確認された場合、利用規約に基づき利用を制限することがあります）",
  },
  { label: "支払方法", value: "クレジットカード（Stripe による決済）" },
  { label: "支払時期", value: "お申し込み時に課金され、以降1か月ごとに自動更新されます" },
  { label: "サービスの提供時期", value: "決済完了後、直ちにご利用いただけます" },
  {
    label: "解約・キャンセル",
    value:
      "解約手続きは、アカウントメニューの「プラン管理」からいつでも行えます。解約後も当該請求期間の終了までご利用いただけます。デジタルサービスの性質上、日割りその他の返金はいたしません",
  },
  { label: "動作環境", value: "モダンブラウザ（Chrome / Safari / Edge / Firefox）の最新版" },
  { label: "特別条件", value: "有料プランのお申し込み前に、無料プランで機能をお試しいただけます" },
];

export default function TokushohoPage() {
  return (
    <LegalShell title="特定商取引法に基づく表記">
      <dl>
        {ROWS.map((r) => (
          <div key={r.label} className="border-b border-[#d8dde8] py-3 first:pt-0 last:border-b-0 sm:flex sm:gap-4">
            <dt className="shrink-0 font-medium text-slate-700 sm:w-44">{r.label}</dt>
            <dd className="mt-0.5 min-w-0 break-words sm:mt-0">{r.value}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-6 text-[11px] text-slate-400">制定日: 2026年7月2日</p>
    </LegalShell>
  );
}
