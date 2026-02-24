alter table public.decision_cards
  add column if not exists summary text,
  add column if not exists created_by uuid,
  add column if not exists updated_at timestamptz,
  add column if not exists snapshot_start timestamptz,
  add column if not exists snapshot_end timestamptz,
  add column if not exists referee_report jsonb;

alter table public.decision_cards
  alter column updated_at set default now();

update public.decision_cards
  set updated_at = coalesce(updated_at, created_at)
  where updated_at is null;

update public.decision_cards dc
  set snapshot_start = coalesce(dc.snapshot_start, t.start_ts),
      snapshot_end = coalesce(dc.snapshot_end, t.end_ts),
      referee_report = coalesce(dc.referee_report, t.referee_report)
  from public.arena_threads t
  where dc.thread_id = t.id;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'decision_cards_thread_id_key'
  ) then
    alter table public.decision_cards
      add constraint decision_cards_thread_id_key unique (thread_id);
  end if;
end;
$$;

create index if not exists idx_decision_cards_workspace_created_at
  on public.decision_cards (workspace_id, created_at desc);
