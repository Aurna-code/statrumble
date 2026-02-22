alter table public.arena_threads
  add column if not exists visibility text;

alter table public.arena_threads
  alter column visibility set default 'workspace';

update public.arena_threads
set visibility = 'workspace'
where visibility is null;

alter table public.arena_threads
  alter column visibility set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'arena_threads_visibility_check'
  ) then
    alter table public.arena_threads
      add constraint arena_threads_visibility_check
      check (visibility in ('workspace', 'invite', 'public'));
  end if;
end;
$$;

create index if not exists idx_arena_threads_workspace_visibility_created_at
  on public.arena_threads (workspace_id, visibility, created_at);
