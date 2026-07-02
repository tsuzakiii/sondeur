-- ユーザーの言語設定を profiles に追加
-- Supabase ダッシュボード → SQL Editor で実行する

alter table public.profiles add column if not exists locale text not null default 'en'
  check (locale in ('en', 'ja'));

-- locale の更新は SECURITY DEFINER 関数経由のみ (profiles の読み取り専用方針を維持)
create or replace function public.update_locale(p_locale text)
returns void
language plpgsql
security definer set search_path = ''
as $$
begin
  if p_locale not in ('en', 'ja') then
    raise exception 'invalid locale';
  end if;
  update public.profiles set locale = p_locale where id = auth.uid();
end;
$$;

revoke all on function public.update_locale(text) from public;
grant execute on function public.update_locale(text) to authenticated;
