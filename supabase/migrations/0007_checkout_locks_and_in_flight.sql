-- Cross-plan checkout race を塞ぐための per-user lock + 追跡列。
-- 詳細は docs/fix-checkout-atomic-lock.md (#15)。

-- 1) checkout_locks: 短窓 (60s TTL) の per-user lock table
create table if not exists public.checkout_locks (
  user_id uuid primary key references auth.users(id) on delete cascade,
  locked_at timestamptz not null,
  token text not null
);

alter table public.checkout_locks enable row level security;

drop policy if exists "no client access to checkout_locks" on public.checkout_locks;
create policy "no client access to checkout_locks" on public.checkout_locks
  for all to anon, authenticated
  using (false)
  with check (false);

revoke all on table public.checkout_locks from anon, authenticated, public;

-- 2) SECURITY DEFINER RPCs (service_role 経由でのみ呼び出される)

create or replace function public.try_acquire_checkout_lock(p_user_id uuid)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_token text;
begin
  insert into public.checkout_locks (user_id, locked_at, token)
  values (p_user_id, now(), gen_random_uuid()::text)
  on conflict (user_id) do update
    set locked_at = excluded.locked_at,
        token = excluded.token
    where checkout_locks.locked_at < now() - interval '60 seconds'
  returning token into v_token;
  return v_token;
end;
$$;

revoke all on function public.try_acquire_checkout_lock(uuid) from anon, authenticated, public;
grant execute on function public.try_acquire_checkout_lock(uuid) to service_role;

create or replace function public.release_checkout_lock(p_user_id uuid, p_token text)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_deleted integer;
begin
  delete from public.checkout_locks
  where user_id = p_user_id and token = p_token;
  get diagnostics v_deleted = row_count;
  return v_deleted > 0;
end;
$$;

revoke all on function public.release_checkout_lock(uuid, text) from anon, authenticated, public;
grant execute on function public.release_checkout_lock(uuid, text) to service_role;

-- 3) profiles.in_flight_checkout_session_id
alter table public.profiles
  add column if not exists in_flight_checkout_session_id text;
