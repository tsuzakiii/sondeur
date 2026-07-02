"use client";

import LegalShell, { LegalSection } from "@/components/LegalShell";
import { useLocale } from "@/lib/i18n";

/** プライバシーポリシー。ja/en をページ内に持つ（i18n 辞書には載せない）。 */

function PrivacyJa() {
  return (
    <>
      <p>
        Sondeur の運営者（以下「運営者」といいます）は、Sondeur（以下「本サービス」といいます）における利用者の個人情報およびユーザーデータの取り扱いについて、個人情報の保護に関する法律（以下「個人情報保護法」といいます）その他の関係法令を遵守するとともに、本プライバシーポリシー（以下「本ポリシー」といいます）に従って適切に取り扱います。
      </p>

      <LegalSection heading="1. 取得する情報">
        <p>運営者は、本サービスの提供にあたり、次の情報を取得します。</p>
        <ol className="mt-2 list-decimal space-y-1 pl-5">
          <li>メールアドレス（アカウント登録およびログイン認証のため）</li>
          <li>ユーザーが本サービスに入力した質問文、選択した語句、および探索履歴（ツリー）の内容</li>
          <li>契約プラン、月間利用量、言語設定その他のアカウント情報</li>
          <li>未ログイン利用時における IP アドレスのハッシュ値（SHA-256）。不正利用防止のためのものであり、IP アドレスそのものは保存せず、ハッシュ値も取得から最大3日で削除します</li>
          <li>決済に関する情報。クレジットカード情報は決済代行事業者である Stripe, Inc. が取り扱い、運営者はカード番号を取得・保持しません</li>
        </ol>
      </LegalSection>

      <LegalSection heading="2. 利用目的">
        <p>運営者は、取得した情報を次の目的で利用します。</p>
        <ol className="mt-2 list-decimal space-y-1 pl-5">
          <li>本サービスの提供、本人認証およびデータ同期のため</li>
          <li>有料プランの決済および契約管理のため</li>
          <li>不正利用の防止および利用制限の実施のため</li>
          <li>本サービスの品質改善、不具合対応および統計的分析のため</li>
          <li>利用規約に違反する行為への対応のため</li>
          <li>本サービスに関する重要なお知らせの通知のため</li>
        </ol>
      </LegalSection>

      <LegalSection heading="3. 第三者提供および委託">
        <ol className="list-decimal space-y-1 pl-5">
          <li>
            運営者は、本サービスの提供のため、次の外部事業者に対し、必要な範囲で情報の取り扱いを委託し、または情報を送信します。
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>OpenAI（生成コンテンツの生成のため、入力された質問文・選択語句等を送信）</li>
              <li>Supabase（本人認証およびデータの保管）</li>
              <li>Stripe（決済処理）</li>
              <li>Vercel（ホスティングおよびアクセス解析）</li>
            </ul>
          </li>
          <li>前号に定める場合および法令に基づく場合を除き、運営者は、あらかじめ本人の同意を得ることなく、個人情報を第三者に提供しません。</li>
          <li>委託先が外国にある場合には、個人情報保護法の定めに従い適切に取り扱います。</li>
        </ol>
      </LegalSection>

      <LegalSection heading="4. Cookie およびローカルストレージ">
        <p>
          本サービスは、ログイン状態の維持のために Cookie を、未ログイン時のツリーの保存および言語設定の記憶のためにブラウザのローカルストレージを使用します。広告配信を目的とした第三者トラッキングは行いません。
        </p>
      </LegalSection>

      <LegalSection heading="5. 保存期間">
        <ol className="list-decimal space-y-1 pl-5">
          <li>アカウント情報およびユーザーコンテンツは、アカウントが存続する間保存します。</li>
          <li>IP アドレスのハッシュ値は、取得から最大3日で削除します。</li>
        </ol>
      </LegalSection>

      <LegalSection heading="6. 安全管理措置">
        <p>
          運営者は、取り扱う情報の漏えい、滅失または毀損の防止その他の安全管理のため、通信の暗号化、データベースへのアクセス制御（行レベルセキュリティ）その他の必要かつ適切な措置を講じます。
        </p>
      </LegalSection>

      <LegalSection heading="7. 開示・訂正・利用停止・削除の請求">
        <p>
          ユーザーは、運営者に対し、個人情報保護法の定めに従い、自己の個人情報の開示、訂正、利用停止または削除を請求することができます。請求は「特定商取引法に基づく表記」に記載の連絡先までご連絡ください。本人確認のうえ、法令に定める期間内に対応します。
        </p>
      </LegalSection>

      <LegalSection heading="8. 本ポリシーの改定">
        <p>
          運営者は、法令の改正または本サービスの内容の変更に応じて、本ポリシーを改定することがあります。重要な変更については、本サービス上での掲載その他の適切な方法により周知します。改定後の本ポリシーは、本サービス上に掲載された時点から適用されます。
        </p>
      </LegalSection>

      <LegalSection heading="9. お問い合わせ窓口">
        <p>
          本ポリシーおよび個人情報の取り扱いに関するお問い合わせは、「特定商取引法に基づく表記」に記載のメールアドレスまでお願いします。
        </p>
      </LegalSection>

      <p className="mt-8 text-[11px] text-slate-400">2026年7月2日 制定</p>
    </>
  );
}

function PrivacyEn() {
  return (
    <>
      <p>
        The operator of Sondeur (the &quot;Operator&quot;) handles users&apos; personal information and user data in the
        Sondeur service (the &quot;Service&quot;) appropriately, in compliance with the Act on the Protection of
        Personal Information of Japan and other applicable laws, and in accordance with this Privacy Policy (this
        &quot;Policy&quot;).
      </p>

      <LegalSection heading="1. Information We Collect">
        <ol className="list-decimal space-y-1 pl-5">
          <li>Email address (for account registration and sign-in authentication);</li>
          <li>Questions entered into the Service, phrases selected, and the contents of exploration histories (trees);</li>
          <li>Account information such as subscribed plan, monthly usage, and language preference;</li>
          <li>A hash (SHA-256) of the IP address when the Service is used without signing in. This is used to prevent abuse; the raw IP address is not stored, and hashes are deleted within 3 days of collection;</li>
          <li>Payment-related information. Credit card details are handled by Stripe, Inc., our payment processor; the Operator does not collect or retain card numbers.</li>
        </ol>
      </LegalSection>

      <LegalSection heading="2. Purposes of Use">
        <ol className="list-decimal space-y-1 pl-5">
          <li>Providing the Service, authenticating users, and synchronizing data;</li>
          <li>Processing payments and managing subscriptions for Paid Plans;</li>
          <li>Preventing abuse and enforcing usage limits;</li>
          <li>Improving quality, addressing defects, and performing statistical analysis;</li>
          <li>Responding to conduct that violates the Terms of Service;</li>
          <li>Sending important notices concerning the Service.</li>
        </ol>
      </LegalSection>

      <LegalSection heading="3. Third-Party Provision and Entrustment">
        <ol className="list-decimal space-y-1 pl-5">
          <li>
            To provide the Service, the Operator entrusts the handling of information to, or transmits information to,
            the following providers to the extent necessary:
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>OpenAI (input text such as questions and selected phrases is transmitted to generate content);</li>
              <li>Supabase (authentication and data storage);</li>
              <li>Stripe (payment processing);</li>
              <li>Vercel (hosting and analytics).</li>
            </ul>
          </li>
          <li>Except as set forth above or as required by law, the Operator does not provide personal information to third parties without the individual&apos;s prior consent.</li>
        </ol>
      </LegalSection>

      <LegalSection heading="4. Cookies and Local Storage">
        <p>
          The Service uses cookies to keep users signed in, and browser local storage to store guest trees and language
          preferences. No third-party advertising trackers are used.
        </p>
      </LegalSection>

      <LegalSection heading="5. Retention Period">
        <ol className="list-decimal space-y-1 pl-5">
          <li>Account information and user content are retained for as long as the account exists.</li>
          <li>IP address hashes are deleted within 3 days of collection.</li>
        </ol>
      </LegalSection>

      <LegalSection heading="6. Security Measures">
        <p>
          The Operator takes necessary and appropriate measures to prevent leakage, loss, or damage of information,
          including encryption of communications and database access controls (row-level security).
        </p>
      </LegalSection>

      <LegalSection heading="7. Disclosure, Correction, Suspension of Use, and Deletion">
        <p>
          Users may request disclosure, correction, suspension of use, or deletion of their personal information in
          accordance with applicable law. Please contact the address listed in the Commercial Disclosure. We will
          respond within the period prescribed by law after verifying your identity.
        </p>
      </LegalSection>

      <LegalSection heading="8. Amendments to this Policy">
        <p>
          The Operator may amend this Policy in response to changes in law or the Service. Material changes will be
          announced within the Service. The amended Policy takes effect when posted on the Service.
        </p>
      </LegalSection>

      <LegalSection heading="9. Contact">
        <p>For inquiries regarding this Policy or the handling of personal information, please contact the email address listed in the Commercial Disclosure.</p>
      </LegalSection>

      <p className="mt-8 text-[11px] text-slate-400">Established: July 2, 2026</p>
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
