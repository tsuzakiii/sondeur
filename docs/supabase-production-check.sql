-- Sondeur production Supabase verification.
-- Run this in the production project SQL Editor after applying migrations 0001-0006.
-- The final two result sets are the security-critical checks for ISSUE-01.

select 'profiles table exists' as check_name, to_regclass('public.profiles') is not null as ok;
select 'trees shared column exists' as check_name, exists (
  select 1
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'trees'
    and column_name = 'shared'
) as ok;
select 'guest_usage table exists' as check_name, to_regclass('public.guest_usage') is not null as ok;

select 'required functions exist' as check_name, proname
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and proname in ('consume_node_quota', 'update_locale', 'consume_guest_quota', 'cleanup_guest_usage')
order by proname;

select
  'RLS enabled' as check_name,
  relname,
  relrowsecurity as ok
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and relname in ('profiles', 'trees', 'nodes', 'guest_usage')
order by relname;

select
  'consume_guest_quota execute grants' as check_name,
  grantee,
  privilege_type
from information_schema.routine_privileges
where routine_schema = 'public'
  and routine_name = 'consume_guest_quota'
order by grantee, privilege_type;

select
  'cleanup_guest_usage execute grants' as check_name,
  grantee,
  privilege_type
from information_schema.routine_privileges
where routine_schema = 'public'
  and routine_name = 'cleanup_guest_usage'
order by grantee, privilege_type;

-- Expected for the two grant result sets above:
-- - service_role has EXECUTE.
-- - anon, authenticated, and PUBLIC do not appear.
-- If any of anon / authenticated / PUBLIC appears, migration 0006_guest_quota_grant.sql
-- has not been applied correctly (or the function was re-created without revoking PUBLIC).
-- PUBLIC EXECUTE would let anonymous REST callers invoke the RPC even though anon/
-- authenticated are absent, so it must be verified explicitly.
