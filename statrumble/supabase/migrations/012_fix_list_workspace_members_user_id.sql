drop function if exists public.list_workspace_members(uuid);

create function public.list_workspace_members(p_workspace_id uuid)
returns table (member_user_id uuid, role text, joined_at timestamptz)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    raise exception 'Unauthorized';
  end if;

  if p_workspace_id is null then
    raise exception 'workspace_id is required';
  end if;

  if not exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = p_workspace_id
      and wm.user_id = auth.uid()
      and wm.role = 'owner'
  ) then
    raise exception 'Only owners can view members';
  end if;

  return query
    select wm.user_id as member_user_id, wm.role, wm.created_at as joined_at
    from public.workspace_members wm
    where wm.workspace_id = p_workspace_id
    order by wm.created_at;
end;
$$;

revoke all on function public.list_workspace_members(uuid) from public;
grant execute on function public.list_workspace_members(uuid) to authenticated;
