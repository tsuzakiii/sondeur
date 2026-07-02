"use client";

import LegalShell, { LegalSection } from "@/components/LegalShell";
import { useLocale } from "@/lib/i18n";

/** 利用規約。長文の法的文書なので i18n 辞書には載せず、ページ内に ja/en 両方を持つ。 */

function TermsJa() {
  return (
    <>
      <p>
        本利用規約（以下「本規約」といいます）は、Sondeur（以下「本サービス」といいます）の運営者（以下「運営者」といいます）が提供する本サービスの利用条件を定めるものです。ユーザーの皆さまには、本規約に同意のうえ、本サービスをご利用いただきます。
      </p>

      <LegalSection heading="第1条（適用）">
        <ol className="list-decimal space-y-1 pl-5">
          <li>本規約は、ユーザーと運営者との間の本サービスの利用に関わる一切の関係に適用されます。</li>
          <li>運営者が本サービス上で随時掲載する個別の注意事項等は、本規約の一部を構成するものとします。</li>
        </ol>
      </LegalSection>

      <LegalSection heading="第2条（定義）">
        <p>本規約において使用する用語の定義は、次の各号のとおりとします。</p>
        <ol className="mt-2 list-decimal space-y-1 pl-5">
          <li>「ユーザー」とは、本サービスを利用するすべての者をいいます。</li>
          <li>「生成コンテンツ」とは、本サービスが大規模言語モデル（AI）を用いて生成し表示する説明文その他の出力をいいます。</li>
          <li>「ユーザーコンテンツ」とは、ユーザーが本サービスに入力した質問文、選択した語句、およびこれらにより構成される探索履歴（ツリー）をいいます。</li>
          <li>「有料プラン」とは、運営者が有償で提供する Standard プランおよび Pro プランをいいます。</li>
        </ol>
      </LegalSection>

      <LegalSection heading="第3条（本規約への同意）">
        <p>
          ユーザーは、本サービスを利用することにより、本規約に同意したものとみなされます。有料プランの購入手続きを行った場合、当該時点で本規約および「特定商取引法に基づく表記」に同意したものとみなされます。
        </p>
      </LegalSection>

      <LegalSection heading="第4条（アカウント）">
        <ol className="list-decimal space-y-1 pl-5">
          <li>アカウントの登録および認証は、ユーザーのメールアドレスを用いて行います。</li>
          <li>ユーザーは、自己の責任においてアカウントを管理するものとし、第三者による利用・不正アクセスに起因する損害について、運営者は運営者に故意または重過失がある場合を除き責任を負いません。</li>
        </ol>
      </LegalSection>

      <LegalSection heading="第5条（本サービスの内容および生成コンテンツの性質）">
        <ol className="list-decimal space-y-1 pl-5">
          <li>本サービスは、ユーザーの質問に対し AI による説明を生成し、ユーザーが説明中の語句を選択して掘り下げることで、探索の履歴を木構造として蓄積する学習支援サービスです。</li>
          <li>生成コンテンツは AI により機械的に生成されるものであり、運営者はその正確性、完全性、最新性および特定目的への適合性についていかなる保証も行いません。</li>
          <li>ユーザーは、生成コンテンツを自己の判断と責任において利用するものとし、重要な意思決定にあたっては一次情報を確認するものとします。</li>
        </ol>
      </LegalSection>

      <LegalSection heading="第6条（利用料金および支払方法）">
        <ol className="list-decimal space-y-1 pl-5">
          <li>有料プランの料金、支払方法、支払時期および解約の条件は、「特定商取引法に基づく表記」に定めるとおりとします。</li>
          <li>有料プランの利用料金は、解約の申し出がない限り、1か月ごとに自動的に更新され課金されます。</li>
          <li>ユーザーは、いつでもプラン管理画面から解約することができます。解約後も、当該請求期間の末日までは有料プランの機能を利用できます。既に支払われた利用料金について、日割りその他による返金は行いません。</li>
          <li>各プランには月間のノード生成数の上限その他の利用制限があります。上限および料金は、事前の告知をもって変更されることがあります。</li>
        </ol>
      </LegalSection>

      <LegalSection heading="第7条（共有機能）">
        <ol className="list-decimal space-y-1 pl-5">
          <li>ユーザーは、自己のツリーを公開リンクとして第三者に共有することができます。共有されたツリーは、リンクを知るすべての者が閲覧できます。</li>
          <li>ユーザーは、いつでも共有を停止することができ、停止後は当該ツリーは第三者から閲覧できなくなります。</li>
          <li>共有するユーザーコンテンツおよびこれに含まれる生成コンテンツについての責任は、共有を行ったユーザーが負うものとします。</li>
        </ol>
      </LegalSection>

      <LegalSection heading="第8条（禁止事項）">
        <p>ユーザーは、本サービスの利用にあたり、次の各号のいずれかに該当する行為をしてはなりません。</p>
        <ol className="mt-2 list-decimal space-y-1 pl-5">
          <li>法令または公序良俗に違反する行為</li>
          <li>犯罪行為に関連する行為</li>
          <li>本サービスのサーバーまたはネットワークの機能を破壊し、もしくは妨害する行為</li>
          <li>利用制限（レート制限・プラン上限）を回避する行為、および運営者が想定しない方法による自動アクセス・大量アクセス</li>
          <li>本サービスのリバースエンジニアリング、逆コンパイルその他の解析行為</li>
          <li>第三者の知的財産権、プライバシーその他の権利または利益を侵害する行為</li>
          <li>差別的表現、誹謗中傷その他第三者に不利益もしくは不快感を与えるコンテンツを共有する行為</li>
          <li>その他、運営者が不適切と合理的に判断する行為</li>
        </ol>
      </LegalSection>

      <LegalSection heading="第9条（知的財産権）">
        <ol className="list-decimal space-y-1 pl-5">
          <li>ユーザーコンテンツに関する権利は、ユーザーに帰属します。ただし、ユーザーは、本サービスの提供・改善に必要な範囲で、運営者がユーザーコンテンツを利用することを許諾するものとします。</li>
          <li>生成コンテンツの利用にあたっては、本規約のほか、生成 AI 提供元の利用条件が適用される場合があります。</li>
          <li>本サービスに関するプログラム、デザインその他の知的財産権は、運営者または正当な権利者に帰属します。</li>
        </ol>
      </LegalSection>

      <LegalSection heading="第10条（本サービスの提供の停止・変更・終了）">
        <ol className="list-decimal space-y-1 pl-5">
          <li>運営者は、システムの保守点検、障害、外部サービス（AI 提供元、決済事業者、ホスティング事業者等）の停止、その他やむを得ない事由がある場合、ユーザーに事前に通知することなく、本サービスの全部または一部の提供を停止または中断することができます。</li>
          <li>運営者は、相当な予告期間をもって本サービス上で告知することにより、本サービスの内容を変更し、または提供を終了することができます。</li>
        </ol>
      </LegalSection>

      <LegalSection heading="第11条（利用制限および登録抹消）">
        <p>
          運営者は、ユーザーが本規約のいずれかの条項に違反した場合、事前の通知なく、当該ユーザーに対する本サービスの全部もしくは一部の利用を制限し、またはアカウントを削除することができます。これによりユーザーに生じた損害について、運営者は一切の責任を負いません。
        </p>
      </LegalSection>

      <LegalSection heading="第12条（保証の否認および免責）">
        <ol className="list-decimal space-y-1 pl-5">
          <li>運営者は、本サービスに事実上または法律上の瑕疵（安全性、信頼性、正確性、完全性、有効性、特定の目的への適合性、セキュリティなどに関する欠陥、エラーやバグ、権利侵害などを含みます）がないことを明示的にも黙示的にも保証しません。</li>
          <li>運営者は、本サービスの利用（生成コンテンツの利用、データの消失、サービスの中断・停止・終了を含みます）によりユーザーに生じたあらゆる損害について、運営者に故意または重過失がある場合を除き、責任を負いません。</li>
          <li>運営者が損害賠償責任を負う場合であっても、その賠償額は、当該ユーザーが損害発生時点からさかのぼって過去12か月間に運営者に支払った利用料金の総額を上限とします。</li>
        </ol>
      </LegalSection>

      <LegalSection heading="第13条（本規約の変更）">
        <p>
          運営者は、民法第548条の4の定めに基づき、本規約を変更することができます。変更後の本規約は、本サービス上での掲載その他の適切な方法により周知し、周知の際に定める効力発生日から適用されます。重要な変更については、相当な予告期間をもって告知します。
        </p>
      </LegalSection>

      <LegalSection heading="第14条（準拠法および合意管轄）">
        <ol className="list-decimal space-y-1 pl-5">
          <li>本規約の解釈にあたっては、日本法を準拠法とします。</li>
          <li>本サービスに関して紛争が生じた場合には、運営者の所在地を管轄する地方裁判所を第一審の専属的合意管轄裁判所とします。</li>
        </ol>
      </LegalSection>

      <p className="mt-8 text-[11px] text-slate-400">2026年7月2日 制定</p>
    </>
  );
}

function TermsEn() {
  return (
    <>
      <p>
        These Terms of Service (the &quot;Terms&quot;) set forth the conditions for the use of Sondeur (the
        &quot;Service&quot;) provided by its operator (the &quot;Operator&quot;). By using the Service, you agree to be
        bound by these Terms.
      </p>

      <LegalSection heading="Article 1 (Scope)">
        <ol className="list-decimal space-y-1 pl-5">
          <li>These Terms apply to all relationships between users and the Operator concerning the use of the Service.</li>
          <li>Any individual notices posted by the Operator within the Service form part of these Terms.</li>
        </ol>
      </LegalSection>

      <LegalSection heading="Article 2 (Definitions)">
        <ol className="list-decimal space-y-1 pl-5">
          <li>&quot;User&quot; means any person who uses the Service.</li>
          <li>&quot;Generated Content&quot; means explanations and other output produced by the Service using large language models (AI).</li>
          <li>&quot;User Content&quot; means questions entered by a User, phrases selected by a User, and the exploration history (trees) composed thereof.</li>
          <li>&quot;Paid Plans&quot; means the Standard and Pro plans offered by the Operator for a fee.</li>
        </ol>
      </LegalSection>

      <LegalSection heading="Article 3 (Agreement to the Terms)">
        <p>
          By using the Service, you are deemed to have agreed to these Terms. By completing a purchase of a Paid Plan,
          you are deemed to have agreed to these Terms and to the Commercial Disclosure at that time.
        </p>
      </LegalSection>

      <LegalSection heading="Article 4 (Accounts)">
        <ol className="list-decimal space-y-1 pl-5">
          <li>Registration and authentication are performed using the User&apos;s email address.</li>
          <li>Users shall manage their accounts at their own responsibility. Except in cases of willful misconduct or gross negligence, the Operator is not liable for damage arising from use by third parties or unauthorized access.</li>
        </ol>
      </LegalSection>

      <LegalSection heading="Article 5 (Nature of the Service and Generated Content)">
        <ol className="list-decimal space-y-1 pl-5">
          <li>The Service generates AI explanations in response to Users&apos; questions and accumulates the exploration history as a tree structure.</li>
          <li>Generated Content is produced mechanically by AI. The Operator makes no warranty as to its accuracy, completeness, currency, or fitness for any particular purpose.</li>
          <li>Users shall use Generated Content at their own judgment and responsibility, and shall verify primary sources before making important decisions.</li>
        </ol>
      </LegalSection>

      <LegalSection heading="Article 6 (Fees and Payment)">
        <ol className="list-decimal space-y-1 pl-5">
          <li>Fees, payment methods, billing timing, and cancellation conditions for Paid Plans are as set forth in the Commercial Disclosure.</li>
          <li>Paid Plan fees renew and are charged automatically on a monthly basis unless cancelled.</li>
          <li>Users may cancel at any time from the plan management screen. After cancellation, Paid Plan features remain available until the end of the current billing period. Fees already paid are non-refundable, including on a pro-rata basis.</li>
          <li>Each plan is subject to usage limits, including a monthly cap on node generation. Limits and fees may be revised with prior notice.</li>
        </ol>
      </LegalSection>

      <LegalSection heading="Article 7 (Sharing)">
        <ol className="list-decimal space-y-1 pl-5">
          <li>Users may share their trees via public links. Shared trees can be viewed by anyone who knows the link.</li>
          <li>Users may stop sharing at any time, after which the tree is no longer viewable by third parties.</li>
          <li>The User who shares is responsible for the shared User Content and any Generated Content included in it.</li>
        </ol>
      </LegalSection>

      <LegalSection heading="Article 8 (Prohibited Conduct)">
        <p>Users shall not engage in any of the following:</p>
        <ol className="mt-2 list-decimal space-y-1 pl-5">
          <li>Acts that violate laws or public order and morals;</li>
          <li>Acts related to criminal activity;</li>
          <li>Acts that destroy or interfere with the Service&apos;s servers or networks;</li>
          <li>Circumventing usage limits (rate limits or plan caps), or automated/bulk access by means not intended by the Operator;</li>
          <li>Reverse engineering, decompiling, or otherwise analyzing the Service;</li>
          <li>Acts that infringe the intellectual property, privacy, or other rights or interests of third parties;</li>
          <li>Sharing content that is discriminatory, defamatory, or otherwise harmful or offensive to third parties;</li>
          <li>Any other act that the Operator reasonably deems inappropriate.</li>
        </ol>
      </LegalSection>

      <LegalSection heading="Article 9 (Intellectual Property)">
        <ol className="list-decimal space-y-1 pl-5">
          <li>Rights to User Content belong to the User. The User grants the Operator a license to use User Content to the extent necessary to provide and improve the Service.</li>
          <li>Use of Generated Content may also be subject to the terms of the AI provider.</li>
          <li>Intellectual property rights in the Service&apos;s programs and designs belong to the Operator or their rightful holders.</li>
        </ol>
      </LegalSection>

      <LegalSection heading="Article 10 (Suspension, Modification, and Termination)">
        <ol className="list-decimal space-y-1 pl-5">
          <li>The Operator may suspend or interrupt all or part of the Service without prior notice in the event of maintenance, failures, outages of external services (AI providers, payment processors, hosting providers, etc.), or other unavoidable circumstances.</li>
          <li>The Operator may modify or terminate the Service by giving reasonable advance notice within the Service.</li>
        </ol>
      </LegalSection>

      <LegalSection heading="Article 11 (Restriction of Use and Account Deletion)">
        <p>
          If a User violates any provision of these Terms, the Operator may restrict the User&apos;s use of all or part
          of the Service or delete the account without prior notice, and shall not be liable for any damage arising
          therefrom.
        </p>
      </LegalSection>

      <LegalSection heading="Article 12 (Disclaimer of Warranties and Limitation of Liability)">
        <ol className="list-decimal space-y-1 pl-5">
          <li>The Operator does not warrant, expressly or impliedly, that the Service is free from defects in fact or in law (including defects relating to safety, reliability, accuracy, completeness, effectiveness, fitness for a particular purpose, or security, as well as errors, bugs, and rights infringements).</li>
          <li>Except in cases of willful misconduct or gross negligence, the Operator is not liable for any damage incurred by Users through use of the Service, including use of Generated Content, loss of data, and suspension or termination of the Service.</li>
          <li>Where the Operator bears liability, the total amount of compensation shall not exceed the total fees paid by the User to the Operator during the 12 months preceding the occurrence of the damage.</li>
        </ol>
      </LegalSection>

      <LegalSection heading="Article 13 (Amendment of the Terms)">
        <p>
          The Operator may amend these Terms in accordance with Article 548-4 of the Civil Code of Japan. Amended Terms
          take effect on the effective date specified when announced within the Service. Material changes will be
          announced with a reasonable notice period.
        </p>
      </LegalSection>

      <LegalSection heading="Article 14 (Governing Law and Jurisdiction)">
        <ol className="list-decimal space-y-1 pl-5">
          <li>These Terms are governed by the laws of Japan.</li>
          <li>The district court having jurisdiction over the Operator&apos;s location shall have exclusive jurisdiction in the first instance over any dispute arising in connection with the Service.</li>
        </ol>
      </LegalSection>

      <p className="mt-8 text-[11px] text-slate-400">Established: July 2, 2026</p>
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
