create or replace function public.ensure_personal_workspace()
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  existing_workspace_id uuid;
  created_workspace_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Unauthorized';
  end if;

  select wm.workspace_id
    into existing_workspace_id
  from public.workspace_members wm
  where wm.user_id = auth.uid()
  order by wm.created_at asc
  limit 1;

  if existing_workspace_id is not null then
    return existing_workspace_id;
  end if;

  insert into public.workspaces (name)
  values ('Personal Workspace')
  returning id into created_workspace_id;

  insert into public.workspace_members (workspace_id, user_id, role)
  values (created_workspace_id, auth.uid(), 'owner')
  on conflict (workspace_id, user_id) do nothing;

  return created_workspace_id;
end;
$$;

revoke all on function public.ensure_personal_workspace() from public;
grant execute on function public.ensure_personal_workspace() to authenticated;
