-- ゲスト (未認証) ユーザーの API 呼び出しを IP ハッシュ + 日単位でカウントし、
-- サーバーレス環境でもインスタンスに依存しない永続的なレート制限を実現する。

create table if not exists public.guest_usage (
  ip_hash text not null,
  day date not null default current_date,
  count int not null default 0,
  primary key (ip_hash, day)
);

-- RLS は不要 (service_role 経由でのみ操作する)
alter table public.guest_usage enable row level security;

-- 自動クリーンアップ: 3日以上前のレコードを削除
create or replace function public.cleanup_guest_usage()
returns void
language plpgsql
security definer set search_path = ''
as $$
begin
  delete from public.guest_usage where day < current_date - interval '3 days';
end;
$$;

-- ゲストの呼び出し枠を消費する。枠内なら true、上限到達なら false。
-- p_ip_hash: クライアント IP の SHA-256 ハッシュ (生 IP は保存しない)
-- p_limit: 日あたりの上限
create or replace function public.consume_guest_quota(p_ip_hash text, p_limit int)
returns boolean
language plpgsql
security definer set search_path = ''
as $$
declare
  cur int;
begin
  insert into public.guest_usage (ip_hash, day, count)
  values (p_ip_hash, current_date, 1)
  on conflict (ip_hash, day)
  do update set count = public.guest_usage.count + 1;

  select count into cur
  from public.guest_usage
  where ip_hash = p_ip_hash and day = current_date;

  -- 定期的にクリーンアップ (1/50 の確率で実行、負荷分散)
  if random() < 0.02 then
    perform public.cleanup_guest_usage();
  end if;

  return cur <= p_limit;
end;
$$;

revoke all on function public.consume_guest_quota(text, int) from public;
