alter table public.arena_threads
  add column if not exists referee_report_updated_at timestamptz;

update public.arena_threads
  set referee_report_updated_at = created_at
  where referee_report is not null
    and referee_report_updated_at is null;
