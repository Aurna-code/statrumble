create table if not exists public.workspace_public_profiles (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  slug text unique not null,
  display_name text not null,
  description text null,
  is_public boolean not null default false,
  public_at timestamptz null,
  updated_at timestamptz not null default now()
);

create index if not exists idx_workspace_public_profiles_public
  on public.workspace_public_profiles (is_public, public_at desc);

alter table public.workspace_public_profiles enable row level security;

drop policy if exists workspace_public_profiles_select_public on public.workspace_public_profiles;
create policy workspace_public_profiles_select_public
  on public.workspace_public_profiles
  for select
  using (is_public = true);

drop policy if exists workspace_public_profiles_select_member on public.workspace_public_profiles;
create policy workspace_public_profiles_select_member
  on public.workspace_public_profiles
  for select
  using (public.is_workspace_member(workspace_id));

create or replace function public.set_workspace_public(
  p_workspace_id uuid,
  p_public boolean,
  p_display_name text default null,
  p_description text default null
)
returns table(slug text, is_public boolean, public_at timestamptz)
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_user_id uuid;
  v_is_owner boolean;
  v_workspace_name text;
  v_existing_slug text;
  v_existing_display_name text;
  v_existing_description text;
  v_display_name text;
  v_description text;
  v_slug text;
  v_base text;
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

  select w.name
    into v_workspace_name
  from public.workspaces w
  where w.id = p_workspace_id;

  if v_workspace_name is null then
    raise exception 'Workspace not found.';
  end if;

  select wpp.slug, wpp.display_name, wpp.description
    into v_existing_slug, v_existing_display_name, v_existing_description
  from public.workspace_public_profiles wpp
  where wpp.workspace_id = p_workspace_id;

  if p_public then
    v_display_name := coalesce(p_display_name, v_workspace_name);
    v_description := coalesce(p_description, v_existing_description);
  else
    v_display_name := coalesce(p_display_name, v_existing_display_name, v_workspace_name);
    v_description := coalesce(p_description, v_existing_description);
  end if;

  if v_display_name is null or length(trim(v_display_name)) = 0 then
    v_display_name := v_workspace_name;
  end if;

  v_slug := v_existing_slug;

  if v_slug is null or length(trim(v_slug)) = 0 then
    v_base := lower(regexp_replace(v_display_name, '[^a-zA-Z0-9]+', '-', 'g'));
    v_base := trim(both '-' from v_base);

    if v_base is null or length(v_base) = 0 then
      v_base := 'workspace';
    end if;

    v_slug := v_base || '-' || substr(gen_random_uuid()::text, 1, 8);
  end if;

  insert into public.workspace_public_profiles (
    workspace_id,
    slug,
    display_name,
    description,
    is_public,
    public_at,
    updated_at
  )
  values (
    p_workspace_id,
    v_slug,
    v_display_name,
    v_description,
    p_public,
    case when p_public then now() else null end,
    now()
  )
  on conflict (workspace_id) do update
    set slug = excluded.slug,
        display_name = excluded.display_name,
        description = excluded.description,
        is_public = excluded.is_public,
        public_at = excluded.public_at,
        updated_at = now();

  return query
  select wpp.slug, wpp.is_public, wpp.public_at
  from public.workspace_public_profiles wpp
  where wpp.workspace_id = p_workspace_id;
end;
$function$;

revoke all on function public.set_workspace_public(uuid, boolean, text, text) from public;
grant execute on function public.set_workspace_public(uuid, boolean, text, text) to authenticated;
