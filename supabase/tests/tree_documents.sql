-- Transactional fixture test: no users, trees or documents survive this script.
begin;
select set_config('test.owner', gen_random_uuid()::text, true);
select set_config('test.other', gen_random_uuid()::text, true);
select set_config('test.tree', gen_random_uuid()::text, true);
select set_config('test.other_tree', gen_random_uuid()::text, true);
insert into auth.users(id) values (current_setting('test.owner')::uuid), (current_setting('test.other')::uuid);
insert into public.trees(id,user_id,title,shared) values
  (current_setting('test.tree')::uuid,current_setting('test.owner')::uuid,'Document RLS fixture',true),
  (current_setting('test.other_tree')::uuid,current_setting('test.other')::uuid,'Other RLS fixture',true);
select set_config('request.jwt.claim.sub',current_setting('test.owner'),true);
set local role authenticated;
do $$
declare saved public.tree_documents;
begin
  select * into saved from public.save_tree_document(current_setting('test.tree')::uuid,'# First',repeat('a',64),'2026-10-01T00:00:00Z','ja');
  if saved.markdown is distinct from '# First' then raise exception 'owner insert/read failed'; end if;
  select * into saved from public.save_tree_document(current_setting('test.tree')::uuid,'# Newest',repeat('b',64),'2026-10-02T00:00:00Z','en');
  if saved.markdown is distinct from '# Newest' then raise exception 'owner update failed'; end if;
  select * into saved from public.save_tree_document(current_setting('test.tree')::uuid,'# Stale retry',repeat('a',64),'2026-10-01T00:00:00Z','ja');
  if saved.markdown is distinct from '# Newest' then raise exception 'stale retry replaced newer document'; end if;
  begin
    update public.tree_documents set tree_id=current_setting('test.other_tree')::uuid where tree_id=current_setting('test.tree')::uuid;
    raise exception 'document reassignment was allowed';
  exception when insufficient_privilege then null; end;
end;
$$;
reset role;
select set_config('request.jwt.claim.sub',current_setting('test.other'),true);
set local role authenticated;
do $$
declare affected integer;
begin
  if exists(select 1 from public.tree_documents where tree_id=current_setting('test.tree')::uuid) then raise exception 'other owner can read shared-tree document'; end if;
  begin
    perform public.save_tree_document(current_setting('test.tree')::uuid,'# Intrusion',repeat('c',64),'2026-10-03T00:00:00Z','en');
    raise exception 'other owner can write document';
  exception when insufficient_privilege then null; end;
  update public.tree_documents set markdown='# Intrusion' where tree_id=current_setting('test.tree')::uuid;
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'other owner can update document'; end if;
  delete from public.tree_documents where tree_id=current_setting('test.tree')::uuid;
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'other owner can delete document'; end if;
end;
$$;
reset role;
select set_config('request.jwt.claim.sub','',true);
set local role anon;
do $$
begin
  begin
    perform 1 from public.tree_documents;
    raise exception 'anon can read documents';
  exception when insufficient_privilege then null; end;
  begin
    perform public.save_tree_document(current_setting('test.tree')::uuid,'# Intrusion',repeat('a',64),now(),'en');
    raise exception 'anon can call save RPC';
  exception when insufficient_privilege then null; end;
end;
$$;
reset role;
select set_config('request.jwt.claim.sub',current_setting('test.owner'),true);
set local role authenticated;
do $$
begin
  if not exists(select 1 from public.tree_documents where tree_id=current_setting('test.tree')::uuid and markdown='# Newest') then raise exception 'document restore failed'; end if;
  delete from public.trees where id=current_setting('test.tree')::uuid;
  if exists(select 1 from public.tree_documents where tree_id=current_setting('test.tree')::uuid) then raise exception 'tree delete did not cascade'; end if;
end;
$$;
reset role;
rollback;
select 'PASS: owner save/restore/update, stale retry, account isolation, anonymous denial, reassignment denial, cascade; fixtures rolled back' as result;
