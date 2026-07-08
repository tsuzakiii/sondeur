---
status: implemented
severity: Low
area: legal / content
files: src/app/api/suggestions/route.ts
---

# OPENAI_API_KEY 欠落時に NHK 見出しをほぼ原文表示する経路がある

## 問題
`src/app/api/suggestions/route.ts:137-143` — `OPENAI_API_KEY` 未設定時のフォールバックが NHK RSS の見出しに「とは？」を付けただけの**ほぼ原文表示** (`source: "rss-raw"`)。通常運用 (LLM で質問文に変換) なら見出しの言い換えで問題ないが、本番でキーが失効/未設定になった瞬間にこの経路が露出する。NHK は RSS を個人利用目的で提供しており、商用サービスでの見出し原文表示は規約的に弱い。

## 修正設計
`rss-raw` 分岐を削除し、キー未設定時は既存の静的フォールバック (`FALLBACK_JA` / `FALLBACK_EN`) を返す:

```ts
if (!process.env.OPENAI_API_KEY) {
  // NHK見出しの原文露出を避けるため、キー未設定時は静的フォールバックを返す (キャッシュしない)
  return Response.json({ date, suggestions: fallback, source: "fallback" });
}
```

- **キャッシュしない** こと: キー復旧後、次のリクエストから即 rss+llm に戻れるように (`cache.set` を呼ばない)
- `fetchHeadlines()` の呼び出し自体はキー確認の**後**に移動してよい (キーが無いのに RSS を取りに行く無駄も消える)。ただし try/catch の構造 (RSS 失敗→fallback) は壊さない
- 未使用になる変数/分岐が出たら削除 (lint が落ちないように)

## 受け入れ条件
- `source: "rss-raw"` の経路がコードから消える
- キー未設定時は FALLBACK_JA/EN が返り、キャッシュに固定されない
- 既存 vitest / lint が通る
