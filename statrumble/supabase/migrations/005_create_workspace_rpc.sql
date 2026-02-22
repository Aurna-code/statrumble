create or replace function public.create_workspace(p_name text)
returns table(workspace_id uuid, invite_code text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  normalized_name text;
  created_workspace_id uuid;
  created_invite_code text;
begin
  if auth.uid() is null then
    raise exception 'Unauthorized';
  end if;

  normalized_name := btrim(coalesce(p_name, ''));

  if normalized_name = '' then
    raise exception 'Workspace name is required';
  end if;

  insert into public.workspaces (name, invite_enabled)
  values (normalized_name, true)
  returning id, workspaces.invite_code
  into created_workspace_id, created_invite_code;

  insert into public.workspace_members (workspace_id, user_id, role)
  values (created_workspace_id, auth.uid(), 'owner')
  on conflict (workspace_id, user_id) do nothing;

  return query
  select created_workspace_id, created_invite_code;
end;
$$;

revoke all on function public.create_workspace(text) from public;
grant execute on function public.create_workspace(text) to authenticated;
