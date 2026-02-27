create table if not exists public.workspace_vote_profiles (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  config jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.workspace_vote_profiles enable row level security;

drop policy if exists workspace_vote_profiles_select_member on public.workspace_vote_profiles;
create policy workspace_vote_profiles_select_member
  on public.workspace_vote_profiles
  for select
  using (
    exists (
      select 1
      from public.workspace_members wm
      where wm.workspace_id = workspace_vote_profiles.workspace_id
        and wm.user_id = auth.uid()
    )
  );

create or replace function public.set_workspace_vote_profile(p_workspace_id uuid, p_config jsonb)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_user_id uuid;
  v_is_owner boolean;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'Unauthorized.';
  end if;

  select exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = p_workspace_id
      and wm.user_id = v_user_id
      and wm.role = 'owner'
  )
    into v_is_owner;

  if not v_is_owner then
    raise exception 'Forbidden.';
  end if;

  insert into public.workspace_vote_profiles (workspace_id, config, created_at, updated_at)
  values (p_workspace_id, p_config, now(), now())
  on conflict (workspace_id) do update
    set config = excluded.config,
        updated_at = now();
end;
$function$;

create or replace function public.get_workspace_vote_profile(p_workspace_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_user_id uuid;
  v_is_member boolean;
  v_config jsonb;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'Unauthorized.';
  end if;

  select exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = p_workspace_id
      and wm.user_id = v_user_id
  )
    into v_is_member;

  if not v_is_member then
    raise exception 'Forbidden.';
  end if;

  select wvp.config
    into v_config
  from public.workspace_vote_profiles wvp
  where wvp.workspace_id = p_workspace_id;

  return v_config;
end;
$function$;

revoke all on function public.set_workspace_vote_profile(uuid, jsonb) from public;
grant execute on function public.set_workspace_vote_profile(uuid, jsonb) to authenticated;

revoke all on function public.get_workspace_vote_profile(uuid) from public;
grant execute on function public.get_workspace_vote_profile(uuid) to authenticated;
