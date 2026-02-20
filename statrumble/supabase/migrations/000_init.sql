create extension if not exists pgcrypto;

create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Default',
  created_at timestamptz not null default now()
);

create table if not exists public.workspace_members (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member',
  created_at timestamptz not null default now(),
  unique (workspace_id, user_id)
);

create table if not exists public.metrics (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  unit text,
  created_at timestamptz not null default now(),
  unique (workspace_id, name)
);

create table if not exists public.metric_imports (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  metric_id uuid not null references public.metrics(id) on delete cascade,
  file_name text,
  row_count int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.metric_points (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  import_id uuid not null references public.metric_imports(id) on delete cascade,
  ts timestamptz not null,
  value double precision not null,
  created_at timestamptz not null default now()
);

create table if not exists public.arena_threads (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  metric_id uuid references public.metrics(id),
  import_id uuid not null references public.metric_imports(id) on delete cascade,
  start_ts timestamptz not null,
  end_ts timestamptz not null,
  snapshot jsonb not null,
  referee_report jsonb,
  created_at timestamptz not null default now(),
  check (end_ts > start_ts)
);

create table if not exists public.arena_messages (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  thread_id uuid not null references public.arena_threads(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  content text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.arena_votes (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  thread_id uuid not null references public.arena_threads(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  stance text not null check (stance in ('A', 'B', 'C')),
  created_at timestamptz not null default now(),
  unique (thread_id, user_id)
);

create table if not exists public.decision_cards (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  thread_id uuid references public.arena_threads(id) on delete set null,
  title text not null,
  decision text not null,
  context text,
  snapshot jsonb not null,
  created_at timestamptz not null default now()
);

insert into public.workspaces (id, name)
values ('11111111-1111-1111-1111-111111111111', 'Default')
on conflict (id) do nothing;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.workspace_members (workspace_id, user_id, role)
  values ('11111111-1111-1111-1111-111111111111', new.id, 'member')
  on conflict (workspace_id, user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row
execute function public.handle_new_user();

create or replace function public.is_workspace_member(p_workspace uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = p_workspace
      and wm.user_id = auth.uid()
  );
$$;

create or replace function public.compute_snapshot(
  p_import_id uuid,
  p_start_ts timestamptz,
  p_end_ts timestamptz
)
returns jsonb
language sql
stable
security invoker
as $$
  with bounds as (
    select
      p_import_id::uuid as import_id,
      p_start_ts::timestamptz as start_ts,
      p_end_ts::timestamptz as end_ts,
      (p_end_ts - p_start_ts) as len
  ),
  metric_meta as (
    select
      mi.id as import_id,
      m.id as metric_id,
      m.name as metric_name,
      m.unit as metric_unit
    from public.metric_imports mi
    join public.metrics m on m.id = mi.metric_id
    where mi.id = p_import_id
  ),
  selected_stats as (
    select
      count(mp.*)::int as n,
      avg(mp.value) as avg,
      min(mp.value) as min,
      max(mp.value) as max,
      stddev_pop(mp.value) as stddev_pop
    from bounds b
    left join public.metric_points mp
      on mp.import_id = b.import_id
     and mp.ts >= b.start_ts
     and mp.ts < b.end_ts
  ),
  before_stats as (
    select
      count(mp.*)::int as n,
      avg(mp.value) as avg,
      min(mp.value) as min,
      max(mp.value) as max,
      stddev_pop(mp.value) as stddev_pop
    from bounds b
    left join public.metric_points mp
      on mp.import_id = b.import_id
     and mp.ts >= (b.start_ts - b.len)
     and mp.ts < b.start_ts
  )
  select jsonb_build_object(
    'import_id', b.import_id,
    'range', jsonb_build_object(
      'start_ts', b.start_ts,
      'end_ts', b.end_ts
    ),
    'metric', jsonb_build_object(
      'id', mm.metric_id,
      'name', mm.metric_name,
      'unit', mm.metric_unit
    ),
    'selected', jsonb_build_object(
      'n', ss.n,
      'avg', ss.avg,
      'min', ss.min,
      'max', ss.max,
      'stddev_pop', ss.stddev_pop
    ),
    'before', jsonb_build_object(
      'n', bs.n,
      'avg', bs.avg,
      'min', bs.min,
      'max', bs.max,
      'stddev_pop', bs.stddev_pop
    ),
    'delta', jsonb_build_object(
      'abs', (ss.avg - bs.avg),
      'rel', case
        when bs.avg is null or bs.avg = 0 or ss.avg is null then null
        else (ss.avg - bs.avg) / abs(bs.avg)
      end
    )
  )
  from bounds b
  left join metric_meta mm on mm.import_id = b.import_id
  cross join selected_stats ss
  cross join before_stats bs;
$$;

create index if not exists idx_metric_points_import_id_ts
  on public.metric_points (import_id, ts);

create index if not exists idx_arena_threads_import_id_start_end
  on public.arena_threads (import_id, start_ts, end_ts);

alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.metrics enable row level security;
alter table public.metric_imports enable row level security;
alter table public.metric_points enable row level security;
alter table public.arena_threads enable row level security;
alter table public.arena_messages enable row level security;
alter table public.arena_votes enable row level security;
alter table public.decision_cards enable row level security;

drop policy if exists workspace_members_select_self on public.workspace_members;
create policy workspace_members_select_self
  on public.workspace_members
  for select
  using (user_id = auth.uid());

drop policy if exists workspaces_select_member on public.workspaces;
create policy workspaces_select_member
  on public.workspaces
  for select
  using (public.is_workspace_member(id));

drop policy if exists workspaces_insert_member on public.workspaces;
create policy workspaces_insert_member
  on public.workspaces
  for insert
  with check (public.is_workspace_member(id));

drop policy if exists workspaces_update_member on public.workspaces;
create policy workspaces_update_member
  on public.workspaces
  for update
  using (public.is_workspace_member(id))
  with check (public.is_workspace_member(id));

drop policy if exists workspaces_delete_member on public.workspaces;
create policy workspaces_delete_member
  on public.workspaces
  for delete
  using (public.is_workspace_member(id));

drop policy if exists metrics_select_member on public.metrics;
create policy metrics_select_member
  on public.metrics
  for select
  using (public.is_workspace_member(workspace_id));

drop policy if exists metrics_insert_member on public.metrics;
create policy metrics_insert_member
  on public.metrics
  for insert
  with check (public.is_workspace_member(workspace_id));

drop policy if exists metrics_update_member on public.metrics;
create policy metrics_update_member
  on public.metrics
  for update
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));

drop policy if exists metrics_delete_member on public.metrics;
create policy metrics_delete_member
  on public.metrics
  for delete
  using (public.is_workspace_member(workspace_id));

drop policy if exists metric_imports_select_member on public.metric_imports;
create policy metric_imports_select_member
  on public.metric_imports
  for select
  using (public.is_workspace_member(workspace_id));

drop policy if exists metric_imports_insert_member on public.metric_imports;
create policy metric_imports_insert_member
  on public.metric_imports
  for insert
  with check (public.is_workspace_member(workspace_id));

drop policy if exists metric_imports_update_member on public.metric_imports;
create policy metric_imports_update_member
  on public.metric_imports
  for update
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));

drop policy if exists metric_imports_delete_member on public.metric_imports;
create policy metric_imports_delete_member
  on public.metric_imports
  for delete
  using (public.is_workspace_member(workspace_id));

drop policy if exists metric_points_select_member on public.metric_points;
create policy metric_points_select_member
  on public.metric_points
  for select
  using (public.is_workspace_member(workspace_id));

drop policy if exists metric_points_insert_member on public.metric_points;
create policy metric_points_insert_member
  on public.metric_points
  for insert
  with check (public.is_workspace_member(workspace_id));

drop policy if exists metric_points_update_member on public.metric_points;
create policy metric_points_update_member
  on public.metric_points
  for update
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));

drop policy if exists metric_points_delete_member on public.metric_points;
create policy metric_points_delete_member
  on public.metric_points
  for delete
  using (public.is_workspace_member(workspace_id));

drop policy if exists arena_threads_select_member on public.arena_threads;
create policy arena_threads_select_member
  on public.arena_threads
  for select
  using (public.is_workspace_member(workspace_id));

drop policy if exists arena_threads_insert_member on public.arena_threads;
create policy arena_threads_insert_member
  on public.arena_threads
  for insert
  with check (public.is_workspace_member(workspace_id));

drop policy if exists arena_threads_update_member on public.arena_threads;
create policy arena_threads_update_member
  on public.arena_threads
  for update
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));

drop policy if exists arena_threads_delete_member on public.arena_threads;
create policy arena_threads_delete_member
  on public.arena_threads
  for delete
  using (public.is_workspace_member(workspace_id));

drop policy if exists arena_messages_select_member on public.arena_messages;
create policy arena_messages_select_member
  on public.arena_messages
  for select
  using (public.is_workspace_member(workspace_id));

drop policy if exists arena_messages_insert_own on public.arena_messages;
create policy arena_messages_insert_own
  on public.arena_messages
  for insert
  with check (
    public.is_workspace_member(workspace_id)
    and user_id = auth.uid()
  );

drop policy if exists arena_messages_update_own on public.arena_messages;
create policy arena_messages_update_own
  on public.arena_messages
  for update
  using (
    public.is_workspace_member(workspace_id)
    and user_id = auth.uid()
  )
  with check (
    public.is_workspace_member(workspace_id)
    and user_id = auth.uid()
  );

drop policy if exists arena_messages_delete_own on public.arena_messages;
create policy arena_messages_delete_own
  on public.arena_messages
  for delete
  using (
    public.is_workspace_member(workspace_id)
    and user_id = auth.uid()
  );

drop policy if exists arena_votes_select_member on public.arena_votes;
create policy arena_votes_select_member
  on public.arena_votes
  for select
  using (public.is_workspace_member(workspace_id));

drop policy if exists arena_votes_insert_own on public.arena_votes;
create policy arena_votes_insert_own
  on public.arena_votes
  for insert
  with check (
    public.is_workspace_member(workspace_id)
    and user_id = auth.uid()
  );

drop policy if exists arena_votes_update_own on public.arena_votes;
create policy arena_votes_update_own
  on public.arena_votes
  for update
  using (
    public.is_workspace_member(workspace_id)
    and user_id = auth.uid()
  )
  with check (
    public.is_workspace_member(workspace_id)
    and user_id = auth.uid()
  );

drop policy if exists arena_votes_delete_member on public.arena_votes;
create policy arena_votes_delete_member
  on public.arena_votes
  for delete
  using (public.is_workspace_member(workspace_id));

drop policy if exists decision_cards_select_member on public.decision_cards;
create policy decision_cards_select_member
  on public.decision_cards
  for select
  using (public.is_workspace_member(workspace_id));

drop policy if exists decision_cards_insert_member on public.decision_cards;
create policy decision_cards_insert_member
  on public.decision_cards
  for insert
  with check (public.is_workspace_member(workspace_id));

drop policy if exists decision_cards_update_member on public.decision_cards;
create policy decision_cards_update_member
  on public.decision_cards
  for update
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));

drop policy if exists decision_cards_delete_member on public.decision_cards;
create policy decision_cards_delete_member
  on public.decision_cards
  for delete
  using (public.is_workspace_member(workspace_id));
