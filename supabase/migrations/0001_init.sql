-- Sondeur 初期スキーマ (設計書 v0.1 §4 データモデル)
-- Supabase ダッシュボード → SQL Editor で実行する

-- プロフィール (auth.users と 1:1)
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  plan text not null default 'free' check (plan in ('free', 'standard', 'pro')),
  stripe_customer_id text,
  monthly_tree_count int not null default 0,
  -- 月次カウントのリセット判定用 (例: '2026-06')
  month_key text not null default to_char(now(), 'YYYY-MM'),
  created_at timestamptz not null default now()
);

-- 新規ユーザー登録時にプロフィールを自動作成
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id) values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ツリー
create table public.trees (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  root_node_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index trees_user_updated_idx on public.trees (user_id, updated_at desc);

-- ノード (追記のみ。編集なし)
create table public.nodes (
  id uuid primary key,
  tree_id uuid not null references public.trees (id) on delete cascade,
  parent_id uuid references public.nodes (id) on delete cascade,
  edge_type text not null check (edge_type in ('root', 'what', 'why', 'ask')),
  selected_span text not null default '',
  span_start int not null default -1,
  span_end int not null default -1,
  question text,
  content text not null default '',
  collapsed boolean not null default false,
  created_at timestamptz not null default now()
);

create index nodes_tree_idx on public.nodes (tree_id);

-- parent_id は同一ツリー内のノードに限る (ツリー間の不正リンク防止)
create or replace function public.check_node_parent_tree()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  if new.parent_id is not null then
    if not exists (
      select 1 from public.nodes p
      where p.id = new.parent_id and p.tree_id = new.tree_id
    ) then
      raise exception 'parent node must belong to the same tree';
    end if;
  end if;
  return new;
end;
$$;

create trigger nodes_parent_same_tree
  before insert or update on public.nodes
  for each row execute function public.check_node_parent_tree();

-- RLS: 自分のデータだけ読み書きできる
alter table public.profiles enable row level security;
alter table public.trees enable row level security;
alter table public.nodes enable row level security;

create policy "own profile" on public.profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);

create policy "own trees" on public.trees
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own nodes" on public.nodes
  for all using (
    exists (select 1 from public.trees t where t.id = tree_id and t.user_id = auth.uid())
  )
  with check (
    exists (select 1 from public.trees t where t.id = tree_id and t.user_id = auth.uid())
  );
