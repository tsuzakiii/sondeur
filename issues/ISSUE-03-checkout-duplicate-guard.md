---
status: implemented
severity: High
area: billing
files: src/app/api/billing/checkout/route.ts
---

# checkout に既存 subscriber ガードがなく二重課金を作れる

## 問題
`src/app/api/billing/checkout/route.ts:33-43` は現 plan / 既存 subscription を確認せず checkout session を作成する。UI (`AuthFooter.tsx`) は free 以外にアップグレードボタンを出さないが、**API を直接叩けば standard 加入中に pro の checkout も、同一 plan の2本目も作成でき、同一 customer に subscription が複数本ぶら下がる** (stripe_customer_id 再利用のため同一 customer 上で重複課金)。plan カラムは最後の webhook で上書きされるだけなので二重払いに気付きにくい。

## 修正設計
既存の profile 取得 (26-30行) を `plan` も含めて select し、二段ガードを入れる:

1. **plan ガード**: `profile.plan` が `"free"` 以外なら 409 を返す
   ```ts
   return Response.json(
     { error: "already subscribed — use the billing portal to change plans" },
     { status: 409 }
   );
   ```
2. **Stripe 側ガード (ベルト&サスペンダー)**: `profile.stripe_customer_id` が存在する場合、
   ```ts
   const subs = await stripe.subscriptions.list({
     customer: profile.stripe_customer_id, status: "active", limit: 1,
   });
   if (subs.data.length > 0) return /* 同じ 409 */;
   ```
   webhook 遅延や plan カラム不整合時 (ISSUE-02 の障害シナリオ) でも Stripe 側の実態で防ぐ。
   `status: "trialing"` は現在トライアル未提供なので active のみで可 (コメントで明示)

## 注意
- プラン変更 (standard→pro) は billing portal 経由が正 (`/api/billing/portal` が既にある)。checkout で受ける必要はない
- UI 側の変更は不要 (そもそも free 以外にはボタンが出ない)

## 受け入れ条件
- plan が standard/pro のユーザーが checkout を叩くと 409
- active subscription を持つ customer は plan カラムが free でも 409
- free ユーザーの新規 checkout は従来通り成功
