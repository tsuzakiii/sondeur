---
status: implemented
severity: Medium
area: cost / abuse
files: src/app/api/expand/route.ts
---

# OpenAI 呼び出しに出力上限がない + preview 環境でゲスト無制限

## 問題
1. `src/app/api/expand/route.ts:117-123` — `client.responses.create` に `max_output_tokens` 指定なし。入力側の検証は良好 (selectedSpan≤500 等) だが、出力トークンが青天井。モデル暴走時のコスト上限がない
2. 168行 — ゲストの rate limit が `process.env.NODE_ENV === "production"` のときのみ。**Vercel の preview デプロイも NODE_ENV=production だが、ローカル以外で無条件開放になる分岐は危うい**うえ、逆に「production ビルドでないステージング」があれば無制限になる。意図を「開発時のみ無効」に反転して安全側に倒す

## 修正設計
1. `openaiStream` の `responses.create` に `max_output_tokens: 4000` を追加。
   - 本文は 200-400 語だが、gpt-5.4-mini は reasoning モデルであり `max_output_tokens` は reasoning トークンも含むため、余裕を持たせて 4000。目的は「正常応答を切らない・暴走だけ止める」
2. ゲスト rate limit の条件を反転:
   ```ts
   } else if (process.env.NODE_ENV !== "development") {
   ```
   - production / preview / test すべてで rate limit が効く (test は Supabase 未設定なら fail-open で従来通り通る)
   - ローカル `next dev` (NODE_ENV=development) のみ無制限

## 受け入れ条件
- `responses.create` に max_output_tokens が入っている
- rate limit 分岐が development 以外で有効
- 既存 vitest が通る
