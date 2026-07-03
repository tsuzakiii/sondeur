---
status: open (オーナー作業)
severity: Medium
area: ops / legal
---

# リリース前オーナー作業チェックリスト (コード外)

## 1. Stripe ダッシュボード: 支払い失敗時の挙動確認
webhook は `past_due` (カード失敗でリトライ中) を降格しない設計 (猶予期間として意図的)。最終的な降格は `customer.subscription.deleted` に依存するため、
**Settings → Billing → Subscriptions and emails → Manage failed payments** で
「リトライ失敗後に **サブスクリプションをキャンセルする**」になっていることを確認する。
「past_due のまま放置」設定だと未払いユーザーが有料機能を使い続けられる。

## 2. J-PlatPat 商標検索
「Sondeur」「ソンドゥール」を [J-PlatPat](https://www.j-platpat.inpit.go.jp) で直接検索する
(検索エンジンには載らないため Web 調査では未確認 — 監査の唯一の残穴)。
- 対象区分: 第9類 (ソフトウェア)、第41類 (教育)、第42類 (SaaS)
- 同一・類似役務で登録があればリリース前に名称再検討

## 3. Supabase migration 0006 の本番適用
ISSUE-01 の `0006_guest_quota_grant.sql` を本番 Supabase に適用する
(`supabase db push` またはダッシュボードの SQL Editor)。
適用しないと anon から `consume_guest_quota` RPC が叩ける穴が残る。

## 4. Stripe webhook の Vercel 本番 URL 確認
コード修正 (ISSUE-02) デプロイ後、Stripe ダッシュボードの webhook 配信ログで
`checkout.session.completed` が 200 で通ることを一度実決済 (テストモード) で確認。
