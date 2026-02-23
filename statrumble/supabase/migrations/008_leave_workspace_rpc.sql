drop policy if exists workspace_members_delete_self on public.workspace_members;

create or replace function public.leave_workspace(p_workspace_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  member_role text;
  owner_count int;
begin
  if auth.uid() is null then
    raise exception 'Unauthorized';
  end if;

  if p_workspace_id is null then
    raise exception 'workspace_id is required';
  end if;

  select role
    into member_role
  from public.workspace_members
  where workspace_id = p_workspace_id
    and user_id = auth.uid()
  limit 1;

  if member_role is null then
    raise exception 'Workspace membership not found';
  end if;

  if member_role = 'owner' then
    select count(*)
      into owner_count
    from public.workspace_members
    where workspace_id = p_workspace_id
      and role = 'owner';

    if owner_count <= 1 then
      raise exception 'Cannot leave as the last owner';
    end if;
  end if;

  delete from public.workspace_members
  where workspace_id = p_workspace_id
    and user_id = auth.uid();

  return true;
end;
$$;

revoke all on function public.leave_workspace(uuid) from public;
grant execute on function public.leave_workspace(uuid) to authenticated;
