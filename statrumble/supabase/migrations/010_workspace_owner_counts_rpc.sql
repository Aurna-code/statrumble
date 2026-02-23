create or replace function public.list_workspace_owner_counts()
returns table (workspace_id uuid, owner_count int)
language sql
security definer
set search_path = public, pg_temp
as $$
  select wm.workspace_id, count(*)::int as owner_count
  from public.workspace_members wm
  where wm.role = 'owner'
    and exists (
      select 1
      from public.workspace_members me
      where me.workspace_id = wm.workspace_id
        and me.user_id = auth.uid()
    )
  group by wm.workspace_id;
$$;
