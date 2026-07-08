---
status: implemented
severity: Low
area: security / headers
files: next.config.ts
---

# セキュリティヘッダが皆無

## 問題
`next.config.ts` が空。CSP / X-Frame-Options / X-Content-Type-Options / Referrer-Policy / HSTS のいずれも未設定。middleware も無い。共有ページ `/s/[id]` は他人が生成した LLM テキストを表示するため、最低限 clickjacking (iframe 埋め込み) 対策が欲しい。

## 修正設計
`next.config.ts` に `headers()` で全ルート共通の基本セットを追加:

```ts
const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};
```

- **フル CSP は今回入れない** (リリース直前に inline style/script の洗い出しをするリスクの方が大きい)。将来課題としてコメントを残す
- **重要**: このプロジェクトの Next.js 16 は training data と異なる可能性がある。`node_modules/next/dist/docs/` の該当ドキュメント (headers / next.config) を必ず読んで、`headers()` の書式が Next 16 でも有効か確認してから書くこと (AGENTS.md 参照)

## 受け入れ条件
- `npm run build` 相当の型チェック (`npm run typecheck`) が通る構文
- 全ページ・API レスポンスに上記ヘッダが付く設定になっている
