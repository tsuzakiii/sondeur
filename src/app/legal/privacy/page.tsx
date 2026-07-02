"use client";

import LegalShell, { LegalSection } from "@/components/LegalShell";
import { useLocale } from "@/lib/i18n";

/** プライバシーポリシー。ja/en をページ内に持つ（i18n 辞書には載せない）。 */

function PrivacyJa() {
  return (
    <>
      <p>Sondeur（以下「本サービス」）における個人情報およびユーザーデータの取り扱いを定めます。</p>
      <LegalSection heading="1. 収集する情報">
        <ul className="list-disc space-y-1 pl-5">
          <li>メールアドレス（ログイン認証のため）</li>
          <li>ユーザーが作成したツリーの内容（質問・選択スパン・生成された説明文）</li>
          <li>プラン・利用量・言語設定などのアカウント情報</li>
          <li>未ログイン利用時の IP アドレスのハッシュ値（SHA-256）— レート制限のためで、生の IP アドレスは保存せず、ハッシュ値も最大3日で削除されます</li>
          <li>決済情報 — クレジットカード情報は Stripe が処理し、運営者はカード番号を保持しません</li>
        </ul>
      </LegalSection>
      <LegalSection heading="2. 利用目的">
        <ul className="list-disc space-y-1 pl-5">
          <li>本サービスの提供・認証・データ同期</li>
          <li>有料プランの決済と管理</li>
          <li>不正利用の防止（レート制限）</li>
          <li>サービスの改善・不具合対応</li>
        </ul>
      </LegalSection>
      <LegalSection heading="3. 外部サービスへの提供">
        <p>本サービスは以下の外部サービスを利用しており、必要な範囲でデータが送信されます。</p>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>OpenAI — 説明文の生成のため、質問・選択スパンなどの入力テキストが送信されます</li>
          <li>Supabase — 認証とデータの保管</li>
          <li>Stripe — 決済処理</li>
          <li>Vercel — ホスティング</li>
        </ul>
        <p className="mt-2">法令に基づく場合を除き、上記以外の第三者に個人情報を提供しません。</p>
      </LegalSection>
      <LegalSection heading="4. Cookie・ローカルストレージ">
        <p>
          ログイン状態の維持（Cookie）、未ログイン時のツリー保存・言語設定の記憶（ローカルストレージ）に使用します。広告目的のトラッキングは行いません。
        </p>
      </LegalSection>
      <LegalSection heading="5. 開示・訂正・削除">
        <p>
          ご自身のデータの開示・訂正・削除を希望される場合は、特定商取引法に基づく表記に記載の連絡先までご連絡ください。合理的な期間内に対応します。
        </p>
      </LegalSection>
      <LegalSection heading="6. 改定">
        <p>本ポリシーは必要に応じて改定されることがあります。重要な変更はサービス上で告知します。</p>
      </LegalSection>
      <p className="mt-6 text-[11px] text-slate-400">制定日: 2026年7月2日</p>
    </>
  );
}

function PrivacyEn() {
  return (
    <>
      <p>This policy describes how Sondeur (the &quot;Service&quot;) handles personal information and user data.</p>
      <LegalSection heading="1. Information we collect">
        <ul className="list-disc space-y-1 pl-5">
          <li>Email address (for sign-in)</li>
          <li>Content of trees you create (questions, selected spans, generated explanations)</li>
          <li>Account information such as plan, usage, and language preference</li>
          <li>A hash of your IP address (SHA-256) when not signed in — used for rate limiting; raw IP addresses are not stored, and hashes are deleted within 3 days</li>
          <li>Payment information — card details are processed by Stripe; the operator never holds card numbers</li>
        </ul>
      </LegalSection>
      <LegalSection heading="2. How we use it">
        <ul className="list-disc space-y-1 pl-5">
          <li>Providing the Service, authentication, and data sync</li>
          <li>Processing and managing paid plans</li>
          <li>Preventing abuse (rate limiting)</li>
          <li>Improving the Service and fixing issues</li>
        </ul>
      </LegalSection>
      <LegalSection heading="3. Third-party services">
        <p>The Service relies on the following providers, and data is sent to them as needed:</p>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>OpenAI — your input text (questions, selected spans) is sent to generate explanations</li>
          <li>Supabase — authentication and data storage</li>
          <li>Stripe — payment processing</li>
          <li>Vercel — hosting</li>
        </ul>
        <p className="mt-2">We do not share personal information with any other third party except as required by law.</p>
      </LegalSection>
      <LegalSection heading="4. Cookies and local storage">
        <p>
          Used to keep you signed in (cookies) and to store guest trees and language preference (local storage). No advertising trackers are used.
        </p>
      </LegalSection>
      <LegalSection heading="5. Access, correction, deletion">
        <p>
          To request access to, correction of, or deletion of your data, contact us at the address listed in the Commercial Disclosure. We will respond within a reasonable period.
        </p>
      </LegalSection>
      <LegalSection heading="6. Updates">
        <p>This policy may be updated. Material changes will be announced within the Service.</p>
      </LegalSection>
      <p className="mt-6 text-[11px] text-slate-400">Effective: July 2, 2026</p>
    </>
  );
}

export default function PrivacyPage() {
  const [locale] = useLocale();
  return (
    <LegalShell title={locale === "ja" ? "プライバシーポリシー" : "Privacy Policy"}>
      {locale === "ja" ? <PrivacyJa /> : <PrivacyEn />}
    </LegalShell>
  );
}
