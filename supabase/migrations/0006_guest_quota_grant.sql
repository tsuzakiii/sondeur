-- consume_guest_quota / cleanup_guest_usage を service_role 専用にする。
-- 0005 の revoke は PUBLIC のみで、Supabase の default privileges により
-- anon / authenticated への個別 GRANT が残っていた
-- (POST /rest/v1/rpc/consume_guest_quota が anon key で通ってしまう)。
-- 既存の 0005_guest_rate_limit.sql は書き換えない (適用済み migration の改変禁止)。

revoke all on function public.consume_guest_quota(text, int) from public, anon, authenticated;
revoke all on function public.cleanup_guest_usage() from public, anon, authenticated;
grant execute on function public.consume_guest_quota(text, int) to service_role;
grant execute on function public.cleanup_guest_usage() to service_role;
