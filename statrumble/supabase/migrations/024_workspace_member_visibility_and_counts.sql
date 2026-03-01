create or replace function public.list_workspace_members(p_workspace_id uuid)
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
  ) then
    raise exception 'Only workspace members can view members';
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

create or replace function public.list_workspace_member_counts()
returns table (workspace_id uuid, member_count int)
language sql
security definer
set search_path = public, pg_temp
as $$
  select wm.workspace_id, count(*)::int as member_count
  from public.workspace_members wm
  where exists (
    select 1
    from public.workspace_members me
    where me.workspace_id = wm.workspace_id
      and me.user_id = auth.uid()
  )
  group by wm.workspace_id;
$$;

revoke all on function public.list_workspace_member_counts() from public;
grant execute on function public.list_workspace_member_counts() to authenticated;
