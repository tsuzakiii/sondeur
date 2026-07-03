---
status: implemented
severity: Low
area: chore
files: src/lib/stripe.ts, public/*.svg
---

# Stripe apiVersion 未固定 + create-next-app テンプレ SVG 残骸

## 問題1: apiVersion 未固定
`src/lib/stripe.ts:12` — `new Stripe(process.env.STRIPE_SECRET_KEY!)` で `apiVersion` 未指定。SDK 同梱バージョンに暗黙固定されるため即死はしないが、SDK 更新時に webhook payload の型が変わり得る。

### 修正設計
stripe-node v22 の型が期待する apiVersion リテラルを明示する:
```ts
stripe ??= new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: "<v22の型が要求するリテラル>" });
```
- 正しいリテラルは `node_modules/stripe/types/lib.d.ts` の `LatestApiVersion` (または `Stripe.StripeConfig["apiVersion"]` の型定義) を**実際に読んで**確認すること。推測で書かない
- typecheck が通ることを確認

## 問題2: テンプレ SVG 残骸
`public/next.svg`, `public/vercel.svg`, `public/globe.svg`, `public/window.svg`, `public/file.svg` は create-next-app の同梱物で、コードから未参照。`vercel.svg` はブランドロゴなのでリリース前に消しておくのが綺麗。

### 修正設計
1. `grep -rn "next.svg\|vercel.svg\|globe.svg\|window.svg\|file.svg" src/` で本当に未参照であることを確認
2. 未参照確認済みの 5 ファイルを削除。参照が見つかったものは**削除せず** issue にメモを残す

## 受け入れ条件
- apiVersion が型に合うリテラルで固定され typecheck が通る
- 未参照 SVG が消えている (参照ありは残す)
