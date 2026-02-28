create or replace function public.get_public_decision_detail(p_public_id uuid)
returns table(
  id uuid,
  title text,
  summary text,
  created_at timestamptz,
  snapshot_start timestamptz,
  snapshot_end timestamptz,
  referee_report jsonb,
  thread_id uuid,
  thread_kind text,
  transform_prompt text,
  transform_spec jsonb,
  transform_sql_preview text,
  transform_stats jsonb,
  transform_diff_report jsonb
)
language sql
security definer
set search_path = public, pg_temp
as $$
  select
    dc.id,
    dc.title,
    dc.summary,
    dc.created_at,
    dc.snapshot_start,
    dc.snapshot_end,
    dc.referee_report,
    dc.thread_id,
    t.kind as thread_kind,
    t.transform_prompt,
    t.transform_spec,
    t.transform_sql_preview,
    t.transform_stats,
    t.transform_diff_report
  from public.decision_cards dc
  left join public.arena_threads t
    on t.id = dc.thread_id
   and t.workspace_id = dc.workspace_id
  where dc.is_public = true
    and dc.public_id = p_public_id
    and dc.public_id is not null
  limit 1;
$$;

revoke all on function public.get_public_decision_detail(uuid) from public;
grant execute on function public.get_public_decision_detail(uuid) to anon, authenticated;
