alter table public.arena_threads
  add column if not exists vote_prompt text;

alter table public.arena_threads
  add column if not exists vote_labels jsonb;

with thread_vote_source as (
  select
    t.id,
    case
      when t.kind = 'transform_proposal' then 'Should we accept this transform proposal?'
      else 'Is the change in the selected range meaningful?'
    end as default_prompt,
    case
      when t.kind = 'transform_proposal' then jsonb_build_object('A', 'Accept', 'B', 'Reject', 'C', 'Revise')
      else jsonb_build_object('A', 'Yes', 'B', 'No', 'C', 'Unclear')
    end as default_labels,
    case
      when t.kind = 'transform_proposal' then wvp.config -> 'transform_proposal' ->> 'prompt'
      else wvp.config -> 'discussion' ->> 'prompt'
    end as workspace_prompt,
    case
      when t.kind = 'transform_proposal' then wvp.config -> 'transform_proposal' -> 'labels'
      else wvp.config -> 'discussion' -> 'labels'
    end as workspace_labels
  from public.arena_threads t
  left join public.workspace_vote_profiles wvp on wvp.workspace_id = t.workspace_id
)
update public.arena_threads t
set
  vote_prompt = coalesce(
    t.vote_prompt,
    nullif(btrim(src.workspace_prompt), ''),
    src.default_prompt
  ),
  vote_labels = coalesce(
    t.vote_labels,
    case
      when src.workspace_labels is not null
        and jsonb_typeof(src.workspace_labels) = 'object'
        and src.workspace_labels ? 'A'
        and src.workspace_labels ? 'B'
        and src.workspace_labels ? 'C'
        and jsonb_typeof(src.workspace_labels -> 'A') = 'string'
        and jsonb_typeof(src.workspace_labels -> 'B') = 'string'
        and jsonb_typeof(src.workspace_labels -> 'C') = 'string'
        and length(btrim(src.workspace_labels ->> 'A')) > 0
        and length(btrim(src.workspace_labels ->> 'B')) > 0
        and length(btrim(src.workspace_labels ->> 'C')) > 0
      then jsonb_build_object(
        'A', btrim(src.workspace_labels ->> 'A'),
        'B', btrim(src.workspace_labels ->> 'B'),
        'C', btrim(src.workspace_labels ->> 'C')
      )
      else src.default_labels
    end
  )
from thread_vote_source src
where src.id = t.id
  and (t.vote_prompt is null or t.vote_labels is null);

alter table public.arena_threads
  alter column vote_prompt set not null;

alter table public.arena_threads
  alter column vote_labels set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'arena_threads_vote_labels_check'
  ) then
    alter table public.arena_threads
      add constraint arena_threads_vote_labels_check
      check (
        jsonb_typeof(vote_labels) = 'object'
        and vote_labels ? 'A'
        and vote_labels ? 'B'
        and vote_labels ? 'C'
        and jsonb_typeof(vote_labels -> 'A') = 'string'
        and jsonb_typeof(vote_labels -> 'B') = 'string'
        and jsonb_typeof(vote_labels -> 'C') = 'string'
        and length(btrim(vote_labels ->> 'A')) > 0
        and length(btrim(vote_labels ->> 'B')) > 0
        and length(btrim(vote_labels ->> 'C')) > 0
      );
  end if;
end $$;

create or replace function public.set_thread_vote_profile(
  p_thread_id uuid,
  p_vote_prompt text,
  p_vote_labels jsonb,
  p_reset_votes boolean default false
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_user_id uuid;
  v_workspace_id uuid;
  v_is_owner boolean;
  v_vote_count bigint;
  v_vote_prompt text;
  v_label_a text;
  v_label_b text;
  v_label_c text;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'Unauthorized.';
  end if;

  select t.workspace_id
    into v_workspace_id
  from public.arena_threads t
  where t.id = p_thread_id;

  if v_workspace_id is null then
    raise exception 'Thread not found.';
  end if;

  select exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = v_workspace_id
      and wm.user_id = v_user_id
      and wm.role = 'owner'
  )
    into v_is_owner;

  if not v_is_owner then
    raise exception 'Forbidden.';
  end if;

  v_vote_prompt := nullif(btrim(p_vote_prompt), '');

  if v_vote_prompt is null then
    raise exception 'vote_prompt is required.';
  end if;

  if p_vote_labels is null or jsonb_typeof(p_vote_labels) <> 'object' then
    raise exception 'Invalid vote_labels.';
  end if;

  v_label_a := nullif(btrim(p_vote_labels ->> 'A'), '');
  v_label_b := nullif(btrim(p_vote_labels ->> 'B'), '');
  v_label_c := nullif(btrim(p_vote_labels ->> 'C'), '');

  if v_label_a is null or v_label_b is null or v_label_c is null then
    raise exception 'Invalid vote_labels.';
  end if;

  select count(*)
    into v_vote_count
  from public.arena_votes v
  where v.thread_id = p_thread_id
    and v.workspace_id = v_workspace_id;

  if v_vote_count > 0 and not coalesce(p_reset_votes, false) then
    raise exception 'Votes exist; enable reset_votes to change.';
  end if;

  if v_vote_count > 0 and coalesce(p_reset_votes, false) then
    delete from public.arena_votes v
    where v.thread_id = p_thread_id
      and v.workspace_id = v_workspace_id;
  end if;

  update public.arena_threads t
  set
    vote_prompt = v_vote_prompt,
    vote_labels = jsonb_build_object(
      'A', v_label_a,
      'B', v_label_b,
      'C', v_label_c
    ),
    referee_report = null,
    referee_report_updated_at = null
  where t.id = p_thread_id
    and t.workspace_id = v_workspace_id;
end;
$function$;

revoke all on function public.set_thread_vote_profile(uuid, text, jsonb, boolean) from public;
grant execute on function public.set_thread_vote_profile(uuid, text, jsonb, boolean) to authenticated;
