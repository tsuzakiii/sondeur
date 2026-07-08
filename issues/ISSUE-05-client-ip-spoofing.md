---
status: implemented
severity: Low
area: security / rate limit
files: src/lib/guestRateLimit.ts
---

# getClientIp が x-forwarded-for の先頭を無検証で信用 → 偽装でバイパス可能

## 問題
`src/lib/guestRateLimit.ts:48-52` — `x-forwarded-for` の**先頭要素**を IP に採用。XFF の先頭はクライアントが任意に付けられる (プロキシは追記するだけ) ため、毎リクエスト別の偽 IP を送れば 15回/日 制限を無限にバイパスできる。

副次: IP 取得失敗時のフォールバック `"unknown"` は全ゲストが同一カウンタを共有する (正規ユーザー同士が枠を奪い合う)。

## 修正設計
Vercel 環境ではプラットフォームが付与する信頼できるヘッダを優先する:

```ts
export function getClientIp(request: Request): string {
  // Vercel が付与する改ざん不能ヘッダを最優先
  const vercel = request.headers.get("x-vercel-forwarded-for");
  if (vercel) return vercel.split(",")[0].trim();
  const real = request.headers.get("x-real-ip");
  if (real) return real.trim();
  // 非 Vercel 環境のフォールバック (偽装可能である点は許容)
  const fwd = request.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return "unknown";
}
```

- `x-vercel-forwarded-for` / `x-real-ip` は Vercel のプロキシが設定しクライアント値を上書きするため信頼できる
- `"unknown"` フォールバックは現状維持 (Vercel 上ではまず到達しない。到達した場合に全開放するより共有カウンタの方が安全側)

## 受け入れ条件
- ヘッダ優先順位が x-vercel-forwarded-for → x-real-ip → x-forwarded-for → "unknown"
- 既存の呼び出し側 (api/expand) は変更不要
