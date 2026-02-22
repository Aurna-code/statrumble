alter table public.workspaces
  add column if not exists invite_code text;

alter table public.workspaces
  add column if not exists invite_enabled boolean;

update public.workspaces
set invite_enabled = true
where invite_enabled is null;

alter table public.workspaces
  alter column invite_enabled set default true;

alter table public.workspaces
  alter column invite_enabled set not null;

create or replace function public.generate_workspace_invite_code()
returns text
language plpgsql
set search_path = public, pg_temp
as $$
declare
  generated_code text;
begin
  loop
    generated_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));

    exit when not exists (
      select 1
      from public.workspaces w
      where w.invite_code = generated_code
    );
  end loop;

  return generated_code;
end;
$$;

update public.workspaces
set invite_code = public.generate_workspace_invite_code()
where invite_code is null
   or btrim(invite_code) = '';

alter table public.workspaces
  alter column invite_code set default public.generate_workspace_invite_code();

alter table public.workspaces
  alter column invite_code set not null;

create unique index if not exists idx_workspaces_invite_code
  on public.workspaces (invite_code);

create or replace function public.join_workspace_by_code(p_invite_code text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  normalized_code text;
  target_workspace_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Unauthorized';
  end if;

  normalized_code := upper(btrim(coalesce(p_invite_code, '')));

  if normalized_code = '' then
    raise exception 'Invite code is required';
  end if;

  select w.id
    into target_workspace_id
  from public.workspaces w
  where w.invite_code = normalized_code
    and w.invite_enabled is true
  limit 1;

  if target_workspace_id is null then
    raise exception 'Invite code is invalid or disabled';
  end if;

  insert into public.workspace_members (workspace_id, user_id, role)
  values (target_workspace_id, auth.uid(), 'member')
  on conflict (workspace_id, user_id) do nothing;

  return target_workspace_id;
end;
$$;

revoke all on function public.join_workspace_by_code(text) from public;
grant execute on function public.join_workspace_by_code(text) to authenticated;
