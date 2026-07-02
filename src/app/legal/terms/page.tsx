"use client";

import LegalShell, { LegalSection } from "@/components/LegalShell";
import { useLocale } from "@/lib/i18n";

/** 利用規約。長文の法的文書なので i18n 辞書には載せず、ページ内に ja/en 両方を持つ。 */

function TermsJa() {
  return (
    <>
      <p>
        本規約は、Sondeur（以下「本サービス」）の利用条件を定めるものです。ユーザーは本サービスを利用することにより、本規約に同意したものとみなされます。
      </p>
      <LegalSection heading="第1条（サービス内容）">
        <p>
          本サービスは、AI による説明文の生成と、その内容を掘り下げて木構造として蓄積する学習支援サービスです。生成される説明は大規模言語モデルによるものであり、
          <strong className="font-medium text-slate-700">正確性・完全性・最新性を保証しません</strong>
          。重要な判断には一次情報の確認を行ってください。
        </p>
      </LegalSection>
      <LegalSection heading="第2条（アカウント）">
        <p>
          ログインにはメールアドレスを使用します。アカウントの管理責任はユーザーにあり、第三者による不正利用について運営者は責任を負いません。
        </p>
      </LegalSection>
      <LegalSection heading="第3条（プランと支払い）">
        <p>
          有料プランの料金・支払方法・解約条件は「特定商取引法に基づく表記」に定めるとおりです。各プランには月間のノード生成数の上限があり、上限や価格は事前の告知をもって変更されることがあります。
        </p>
      </LegalSection>
      <LegalSection heading="第4条（共有機能）">
        <p>
          ユーザーはツリーを公開リンクとして共有できます。共有されたツリーはリンクを知る誰でも閲覧できます。共有はいつでも停止でき、停止後は閲覧できなくなります。共有する内容についての責任はユーザーが負います。
        </p>
      </LegalSection>
      <LegalSection heading="第5条（禁止事項）">
        <ul className="list-disc space-y-1 pl-5">
          <li>法令または公序良俗に違反する行為</li>
          <li>本サービスの API・レート制限の回避、リバースエンジニアリング、過度な自動アクセス</li>
          <li>第三者の権利を侵害するコンテンツの生成・共有</li>
          <li>本サービスの運営を妨害する行為</li>
        </ul>
      </LegalSection>
      <LegalSection heading="第6条（知的財産）">
        <p>
          ユーザーが作成したツリー（質問・選択スパン）はユーザーに帰属します。AI が生成した説明文の利用は、生成 AI 提供元の利用条件にも従うものとします。本サービスのデザイン・プログラムに関する権利は運営者に帰属します。
        </p>
      </LegalSection>
      <LegalSection heading="第7条（免責）">
        <p>
          運営者は、本サービスの中断・停止・データ消失・AI 出力の内容に起因する損害について、運営者に故意または重過失がある場合を除き責任を負いません。運営者が責任を負う場合でも、賠償額は当該ユーザーが過去12か月に支払った利用料金を上限とします。
        </p>
      </LegalSection>
      <LegalSection heading="第8条（規約の変更）">
        <p>本規約は必要に応じて変更されることがあります。重要な変更はサービス上で告知します。</p>
      </LegalSection>
      <LegalSection heading="第9条（準拠法・管轄）">
        <p>本規約は日本法に準拠し、本サービスに関する紛争は運営者の所在地を管轄する裁判所を第一審の専属的合意管轄裁判所とします。</p>
      </LegalSection>
      <p className="mt-6 text-[11px] text-slate-400">制定日: 2026年7月2日</p>
    </>
  );
}

function TermsEn() {
  return (
    <>
      <p>
        These Terms govern your use of Sondeur (the &quot;Service&quot;). By using the Service you agree to these Terms.
      </p>
      <LegalSection heading="1. The Service">
        <p>
          Sondeur generates AI explanations and lets you drill into them, accumulating your exploration as a tree. Explanations are produced by large language models and{" "}
          <strong className="font-medium text-slate-700">accuracy, completeness, and currency are not guaranteed</strong>. Verify primary sources before making important decisions.
        </p>
      </LegalSection>
      <LegalSection heading="2. Accounts">
        <p>
          Sign-in uses your email address. You are responsible for your account; the operator is not liable for unauthorized use by third parties.
        </p>
      </LegalSection>
      <LegalSection heading="3. Plans and payment">
        <p>
          Pricing, payment methods, and cancellation terms for paid plans are described in the Commercial Disclosure. Each plan has a monthly node generation limit; limits and prices may change with prior notice.
        </p>
      </LegalSection>
      <LegalSection heading="4. Sharing">
        <p>
          You can share a tree via a public link. Anyone with the link can view it. You can stop sharing at any time, after which the tree is no longer viewable. You are responsible for what you share.
        </p>
      </LegalSection>
      <LegalSection heading="5. Prohibited conduct">
        <ul className="list-disc space-y-1 pl-5">
          <li>Violating laws or public order</li>
          <li>Circumventing API rate limits, reverse engineering, or excessive automated access</li>
          <li>Generating or sharing content that infringes third-party rights</li>
          <li>Interfering with the operation of the Service</li>
        </ul>
      </LegalSection>
      <LegalSection heading="6. Intellectual property">
        <p>
          Trees you create (questions and selected spans) belong to you. Use of AI-generated text is also subject to the AI provider&apos;s terms. Rights to the Service&apos;s design and code belong to the operator.
        </p>
      </LegalSection>
      <LegalSection heading="7. Disclaimer">
        <p>
          Except in cases of intent or gross negligence, the operator is not liable for damages arising from interruptions, data loss, or AI output. Any liability is capped at the fees you paid in the preceding 12 months.
        </p>
      </LegalSection>
      <LegalSection heading="8. Changes">
        <p>These Terms may be updated. Material changes will be announced within the Service.</p>
      </LegalSection>
      <LegalSection heading="9. Governing law">
        <p>These Terms are governed by the laws of Japan. Disputes shall be subject to the exclusive jurisdiction of the court having jurisdiction over the operator&apos;s location.</p>
      </LegalSection>
      <p className="mt-6 text-[11px] text-slate-400">Effective: July 2, 2026</p>
    </>
  );
}

export default function TermsPage() {
  const [locale] = useLocale();
  return (
    <LegalShell title={locale === "ja" ? "利用規約" : "Terms of Service"}>
      {locale === "ja" ? <TermsJa /> : <TermsEn />}
    </LegalShell>
  );
}
