-- Private latest document per exploration. Public tree sharing never exposes this table.
create table public.tree_documents (
  tree_id uuid primary key references public.trees(id) on delete cascade,
  markdown text not null check (char_length(markdown) between 1 and 200000),
  source_key text not null check (source_key ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null,
  locale text not null check (locale in ('en', 'ja'))
);

alter table public.tree_documents enable row level security;
revoke all on public.tree_documents from public, anon, authenticated;
grant select, insert, update, delete on public.tree_documents to authenticated;
grant all on public.tree_documents to service_role;

create policy "owner reads document" on public.tree_documents for select to authenticated
  using (exists (select 1 from public.trees t where t.id = tree_id and t.user_id = (select auth.uid())));
create policy "owner inserts document" on public.tree_documents for insert to authenticated
  with check (exists (select 1 from public.trees t where t.id = tree_id and t.user_id = (select auth.uid())));
create policy "owner updates document" on public.tree_documents for update to authenticated
  using (exists (select 1 from public.trees t where t.id = tree_id and t.user_id = (select auth.uid())))
  with check (exists (select 1 from public.trees t where t.id = tree_id and t.user_id = (select auth.uid())));
create policy "owner deletes document" on public.tree_documents for delete to authenticated
  using (exists (select 1 from public.trees t where t.id = tree_id and t.user_id = (select auth.uid())));

-- Retrying an older local snapshot must not replace a newer document from another device.
-- SECURITY INVOKER keeps all table grants and ownership policies in force.
create function public.save_tree_document(
  p_tree_id uuid, p_markdown text, p_source_key text, p_created_at timestamptz, p_locale text
) returns setof public.tree_documents
language plpgsql security invoker set search_path = '' as $$
begin
  insert into public.tree_documents(tree_id, markdown, source_key, created_at, locale)
    values (p_tree_id, p_markdown, p_source_key, p_created_at, p_locale)
  on conflict (tree_id) do update set
    markdown = excluded.markdown, source_key = excluded.source_key,
    created_at = excluded.created_at, locale = excluded.locale
  where excluded.created_at > public.tree_documents.created_at;
  return query select * from public.tree_documents where tree_id = p_tree_id;
end;
$$;
revoke all on function public.save_tree_document(uuid,text,text,timestamptz,text) from public, anon;
grant execute on function public.save_tree_document(uuid,text,text,timestamptz,text) to authenticated;
