---
status: implemented
severity: High
area: billing
files: src/app/api/billing/webhook/route.ts
---

# webhook が DB 更新失敗を握りつぶして 200 を返す → Stripe 再送に乗れない

## 問題
`src/app/api/billing/webhook/route.ts`:
- `setPlan()` (7-17行): `getServiceSupabase()` が null でも `console.error` して return (void)。`profiles` update 失敗も `console.error` のみ
- `setPlanByCustomer()` (19-27行): 同様
- 84行: どの経路でも最終的に `{ received: true }` (200) を返す

結果: `SUPABASE_SECRET_KEY` 未設定・Supabase 一時障害・update 失敗のいずれでも Stripe は成功と見なし**再送しない**。ユーザーは課金完了、plan は free のまま、自動リカバリ手段なし。

さらに `checkout.session.completed` で `planFromSubscription()` が null (env の price ID 不一致 = 設定ミスや test/live 取り違え) の場合、**何もログせず break → 200**。Sentry にも残らない。

## 修正設計
1. `setPlan` / `setPlanByCustomer` を **成功/失敗を返す** ように変更 (`Promise<boolean>`)。失敗時は `console.error` + `Sentry.captureException` した上で `false` を返す
2. POST ハンドラ側: 意図した更新が失敗したら **500 を返す** (Stripe が最大3日再送する)。処理対象外イベント・対象外 status のフォールスルーは従来通り 200
3. `checkout.session.completed` / `customer.subscription.updated` (active/trialing) で plan が解決できなかった場合:
   - `Sentry.captureMessage` で priceId を含めて記録 (例: `[webhook] unknown price id: ${priceId}`)
   - **500 を返す** (env 修正後の再送で自動リカバリさせるため)
4. `updated` で status が降格対象リストにも active/trialing にも該当しない場合 (`past_due`, `incomplete` 等) は現状維持 (更新なし・200)。この挙動は意図的 (支払いリトライ中の猶予)。コメントで明示すること

実装イメージ (骨子):
```ts
async function setPlan(...): Promise<boolean> {
  const supabase = getServiceSupabase();
  if (!supabase) { /* Sentry + error log */ return false; }
  const { error } = await supabase.from("profiles").update(patch).eq("id", userId);
  if (error) { /* Sentry + error log */ return false; }
  return true;
}
// POST 内:
let ok = true;
switch (event.type) {
  case "checkout.session.completed": {
    ...
    const plan = planFromSubscription(sub);
    if (!plan) { Sentry.captureMessage(...); ok = false; break; }
    ok = await setPlan(userId, plan, customerId);
    break;
  }
  ...
}
if (!ok) return new Response("processing failed", { status: 500 });
return Response.json({ received: true });
```

## 注意
- 冪等性は既存設計で担保済み (plan の絶対値セットのみ)。再送で二重付与は起きない
- 署名検証 (42-49行) は変更しない

## 受け入れ条件
- Supabase 未設定/更新失敗/価格 ID 不一致の各経路で 500 が返る
- 正常経路・対象外イベントは 200
- 失敗経路すべてに Sentry 送信がある
