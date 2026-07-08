---
status: implemented
severity: High
area: security / supabase
files: supabase/migrations/0006_guest_quota_grant.sql (新規)
---

# consume_guest_quota が anon key から直接実行できる

## 問題
`supabase/migrations/0005_guest_rate_limit.sql:54` は
`revoke all on function public.consume_guest_quota(text, int) from public;`
のみ。Supabase は既定で `alter default privileges ... grant execute on functions to anon, authenticated, service_role` を持つため、**PUBLIC からの revoke だけでは anon / authenticated のロール個別 GRANT が残る**。つまり `POST /rest/v1/rpc/consume_guest_quota` が anon key で通る可能性が高い。

対照: `0002_node_quota.sql` の `consume_node_quota` は `grant execute to authenticated` を明示していて正しい。

## 悪用シナリオ
- 任意 IP の SHA-256 を手元計算し anon key で RPC 連打 → 被害者 IP のゲスト枠 (15回/日) を焼き尽くす標的 DoS
- 任意 `ip_hash` を無制限 INSERT して `guest_usage` テーブル肥大化
- `p_limit` はクライアント指定可能なので巨大値を渡して制限自体を無効化

## 修正設計
新規 migration `supabase/migrations/0006_guest_quota_grant.sql` を作成:

```sql
-- consume_guest_quota / cleanup_guest_usage を service_role 専用にする。
-- 0005 の revoke は PUBLIC のみで、Supabase の default privileges により
-- anon / authenticated への個別 GRANT が残っていた。
revoke all on function public.consume_guest_quota(text, int) from public, anon, authenticated;
revoke all on function public.cleanup_guest_usage() from public, anon, authenticated;
grant execute on function public.consume_guest_quota(text, int) to service_role;
grant execute on function public.cleanup_guest_usage() to service_role;
```

- 既存 0005 は書き換えない (適用済み migration の改変禁止)。新規ファイルで上書きする
- アプリコードの変更は不要 (`lib/guestRateLimit.ts` は既に SUPABASE_SECRET_KEY = service_role 経由)

## 受け入れ条件
- 0006 が上記内容で存在し、SQL 構文が正しい
- 本番 Supabase への適用は ISSUE-11 (オーナー作業) で実施
