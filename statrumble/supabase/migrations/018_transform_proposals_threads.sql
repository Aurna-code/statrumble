alter table public.arena_threads
  add column if not exists kind text not null default 'discussion';

alter table public.arena_threads
  add column if not exists parent_thread_id uuid references public.arena_threads(id);

alter table public.arena_threads
  add column if not exists transform_prompt text;

alter table public.arena_threads
  add column if not exists transform_spec jsonb;

alter table public.arena_threads
  add column if not exists transform_sql_preview text;

alter table public.arena_threads
  add column if not exists transform_stats jsonb;

alter table public.arena_threads
  add column if not exists transform_diff_report jsonb;

create index if not exists idx_arena_threads_kind
  on public.arena_threads (kind);

create index if not exists idx_arena_threads_parent_thread_id
  on public.arena_threads (parent_thread_id);
