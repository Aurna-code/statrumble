do $$
declare
  v_policy record;
begin
  for v_policy in
    select policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = 'workspaces'
      and cmd = 'DELETE'
  loop
    execute format('drop policy if exists %I on public.workspaces', v_policy.policyname);
  end loop;
end;
$$;

create or replace function public.delete_workspace(
  p_workspace_id uuid,
  p_confirm_name text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_name text;
begin
  if auth.uid() is null then
    raise exception 'Unauthorized.';
  end if;

  select w.name
    into v_name
  from public.workspaces w
  where w.id = p_workspace_id
  limit 1;

  if v_name is null then
    raise exception 'Not found.';
  end if;

  if not exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = p_workspace_id
      and wm.user_id = auth.uid()
      and wm.role = 'owner'
  ) then
    raise exception 'Forbidden.';
  end if;

  if trim(coalesce(p_confirm_name, '')) <> trim(v_name) then
    raise exception 'Confirmation mismatch.';
  end if;

  delete from public.workspaces
  where id = p_workspace_id;
end;
$$;

revoke all on function public.delete_workspace(uuid, text) from public;
grant execute on function public.delete_workspace(uuid, text) to authenticated;
