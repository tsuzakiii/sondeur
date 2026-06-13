-- プラン制限をツリー数+深さからノード生成数の総量制に変更
-- Supabase ダッシュボード → SQL Editor で実行する

-- 月間ノード生成カウンタ
alter table public.profiles add column if not exists monthly_node_count int not null default 0;

-- profiles はユーザーから読み取り専用にする (カウンタの改ざん防止)。
-- 書き込みはトリガーと SECURITY DEFINER 関数のみ
drop policy if exists "own profile" on public.profiles;
create policy "read own profile" on public.profiles
  for select using (auth.uid() = id);

-- ノード生成枠をアトミックに消費する。枠内なら true、上限到達なら false
create or replace function public.consume_node_quota(p_limit int)
returns boolean
language plpgsql
security definer set search_path = ''
as $$
declare
  cur_month text := to_char(now(), 'YYYY-MM');
  updated int;
begin
  update public.profiles
  set
    monthly_node_count = case when month_key = cur_month then monthly_node_count + 1 else 1 end,
    month_key = cur_month
  where id = auth.uid()
    and (case when month_key = cur_month then monthly_node_count else 0 end) < p_limit;
  get diagnostics updated = row_count;
  return updated > 0;
end;
$$;

revoke all on function public.consume_node_quota(int) from public;
grant execute on function public.consume_node_quota(int) to authenticated;
