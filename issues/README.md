# リリース前監査 Issue一覧 (2026-07-03)

3軸監査 (セキュリティ / 課金経路 / 独自性・法務) で出た指摘のIssue化。
各Issueに設計書を含む。ステータスは各ファイル冒頭の `status:` を更新する。

## コード修正 (サブエージェント振り分け)

| # | 深刻度 | 内容 | 対象ファイル | 担当グループ |
|---|--------|------|------------|------------|
| [01](ISSUE-01-guest-quota-rpc-grant.md) | High | consume_guest_quota がanonから実行可能 | migrations/0006 | B: DB/RateLimit |
| [02](ISSUE-02-webhook-fail-500.md) | High | webhook DB更新失敗を握りつぶして200 | api/billing/webhook | A: Billing |
| [03](ISSUE-03-checkout-duplicate-guard.md) | High | checkout二重サブスク防止なし | api/billing/checkout | A: Billing |
| [04](ISSUE-04-llm-cost-caps.md) | Medium | max_output_tokens未指定+preview環境ゲスト無制限 | api/expand | D: Content/Cost |
| [05](ISSUE-05-client-ip-spoofing.md) | Low | x-forwarded-for先頭信用でrate limitバイパス | lib/guestRateLimit | B: DB/RateLimit |
| [06](ISSUE-06-security-headers.md) | Low | セキュリティヘッダ皆無 | next.config.ts | C: Web hardening |
| [07](ISSUE-07-rss-raw-fallback.md) | Low | NHK見出し原文表示フォールバック | api/suggestions | D: Content/Cost |
| [08](ISSUE-08-share-owner-check.md) | Low | share APIが他人treeIdにok:true | api/share | C: Web hardening |
| [09](ISSUE-09-stripe-apiversion-svg-cleanup.md) | Low | Stripe apiVersion未固定+テンプレSVG残骸 | lib/stripe.ts, public/ | A: Billing |

## オーナー作業 (コード外)

| # | 内容 |
|---|------|
| [10](ISSUE-10-owner-tokushoho.md) | 特商法ページのプレースホルダ記入 (リリースブロッカー) |
| [11](ISSUE-11-owner-ops-checklist.md) | Stripeダッシュボード設定確認 / J-PlatPat商標検索 / Supabase migration適用 |

## 監査で問題なしと確認済みの項目 (参考)

認証ガード・IDOR経路なし・webhook署名検証・secretのクライアント漏洩なし・XSS経路ゼロ・RLS全テーブル有効・quota改ざん不可・オープンリダイレクトなし・ライセンス(GPL等)混入ゼロ・コピペ痕跡なし・名称衝突なし。
