create or replace function public.list_workspace_members(p_workspace_id uuid)
returns table (user_id uuid, role text, joined_at timestamptz)
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
    from public.workspace_members
    where workspace_id = p_workspace_id
      and user_id = auth.uid()
      and role = 'owner'
  ) then
    raise exception 'Only owners can view members';
  end if;

  return query
    select wm.user_id, wm.role, wm.created_at as joined_at
    from public.workspace_members wm
    where wm.workspace_id = p_workspace_id
    order by wm.created_at;
end;
$$;

revoke all on function public.list_workspace_members(uuid) from public;
grant execute on function public.list_workspace_members(uuid) to authenticated;

create or replace function public.promote_workspace_member(
  p_workspace_id uuid,
  p_user_id uuid,
  p_role text
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  caller_role text;
  target_role text;
  owner_count int;
begin
  if auth.uid() is null then
    raise exception 'Unauthorized';
  end if;

  if p_workspace_id is null then
    raise exception 'workspace_id is required';
  end if;

  if p_user_id is null then
    raise exception 'user_id is required';
  end if;

  if p_role is null then
    raise exception 'role is required';
  end if;

  if p_role not in ('member', 'owner') then
    raise exception 'role must be member or owner';
  end if;

  select role
    into caller_role
  from public.workspace_members
  where workspace_id = p_workspace_id
    and user_id = auth.uid()
  limit 1;

  if caller_role is null then
    raise exception 'Workspace membership not found';
  end if;

  if caller_role <> 'owner' then
    raise exception 'Only owners can update roles';
  end if;

  select role
    into target_role
  from public.workspace_members
  where workspace_id = p_workspace_id
    and user_id = p_user_id
  limit 1;

  if target_role is null then
    raise exception 'Target membership not found';
  end if;

  if target_role = 'owner' and p_role <> 'owner' then
    select count(*)
      into owner_count
    from public.workspace_members
    where workspace_id = p_workspace_id
      and role = 'owner';

    if owner_count <= 1 then
      raise exception 'Cannot demote the last owner';
    end if;
  end if;

  update public.workspace_members
  set role = p_role
  where workspace_id = p_workspace_id
    and user_id = p_user_id;

  return true;
end;
$$;

revoke all on function public.promote_workspace_member(uuid, uuid, text) from public;
grant execute on function public.promote_workspace_member(uuid, uuid, text) to authenticated;
