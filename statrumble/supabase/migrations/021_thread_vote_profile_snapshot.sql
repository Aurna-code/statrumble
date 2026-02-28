alter table public.arena_threads
  add column if not exists vote_prompt text,
  add column if not exists vote_labels jsonb;

create or replace function public.is_valid_vote_labels(p_labels jsonb)
returns boolean
language sql
immutable
as $$
  select
    jsonb_typeof(p_labels) = 'object'
    and p_labels ? 'A'
    and p_labels ? 'B'
    and p_labels ? 'C'
    and jsonb_typeof(p_labels -> 'A') = 'string'
    and jsonb_typeof(p_labels -> 'B') = 'string'
    and jsonb_typeof(p_labels -> 'C') = 'string'
    and length(trim(both from p_labels ->> 'A')) > 0
    and length(trim(both from p_labels ->> 'B')) > 0
    and length(trim(both from p_labels ->> 'C')) > 0;
$$;

update public.arena_threads t
set
  vote_prompt = case
    when t.kind = 'transform_proposal' then coalesce(
      nullif(trim(wvp.config -> 'transform_proposal' ->> 'prompt'), ''),
      nullif(trim(wvp.config -> 'profiles' -> 'transform_proposal' ->> 'prompt'), ''),
      'Should we accept this transform proposal?'
    )
    else coalesce(
      nullif(trim(wvp.config -> 'discussion' ->> 'prompt'), ''),
      nullif(trim(wvp.config -> 'profiles' -> 'discussion' ->> 'prompt'), ''),
      'Is the change in the selected range meaningful?'
    )
  end,
  vote_labels = case
    when t.kind = 'transform_proposal' then coalesce(
      case
        when public.is_valid_vote_labels(wvp.config -> 'transform_proposal' -> 'labels')
          then wvp.config -> 'transform_proposal' -> 'labels'
        else null
      end,
      case
        when public.is_valid_vote_labels(wvp.config -> 'profiles' -> 'transform_proposal' -> 'labels')
          then wvp.config -> 'profiles' -> 'transform_proposal' -> 'labels'
        else null
      end,
      '{"A":"Accept","B":"Reject","C":"Revise"}'::jsonb
    )
    else coalesce(
      case
        when public.is_valid_vote_labels(wvp.config -> 'discussion' -> 'labels')
          then wvp.config -> 'discussion' -> 'labels'
        else null
      end,
      case
        when public.is_valid_vote_labels(wvp.config -> 'profiles' -> 'discussion' -> 'labels')
          then wvp.config -> 'profiles' -> 'discussion' -> 'labels'
        else null
      end,
      '{"A":"Yes","B":"No","C":"Unclear"}'::jsonb
    )
  end
from public.workspace_vote_profiles wvp
where wvp.workspace_id = t.workspace_id
  and (
    t.vote_prompt is null
    or length(trim(t.vote_prompt)) = 0
    or public.is_valid_vote_labels(t.vote_labels) is not true
  );

update public.arena_threads t
set
  vote_prompt = case
    when t.kind = 'transform_proposal' then 'Should we accept this transform proposal?'
    else 'Is the change in the selected range meaningful?'
  end,
  vote_labels = case
    when t.kind = 'transform_proposal' then '{"A":"Accept","B":"Reject","C":"Revise"}'::jsonb
    else '{"A":"Yes","B":"No","C":"Unclear"}'::jsonb
  end
where
  t.vote_prompt is null
  or length(trim(t.vote_prompt)) = 0
  or public.is_valid_vote_labels(t.vote_labels) is not true;

alter table public.arena_threads
  alter column vote_prompt set not null,
  alter column vote_labels set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'arena_threads_vote_labels_valid'
  ) then
    alter table public.arena_threads
      add constraint arena_threads_vote_labels_valid
      check (public.is_valid_vote_labels(vote_labels));
  end if;
end;
$$;

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
as $$
declare
  v_user_id uuid;
  v_workspace_id uuid;
  v_prompt text;
  v_votes_exist boolean;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'Unauthorized.';
  end if;

  if p_thread_id is null then
    raise exception 'thread_id is required.';
  end if;

  v_prompt := nullif(trim(p_vote_prompt), '');

  if v_prompt is null then
    raise exception 'vote_prompt is required.';
  end if;

  if not public.is_valid_vote_labels(p_vote_labels) then
    raise exception 'vote_labels must contain non-empty string values for A, B, and C.';
  end if;

  select t.workspace_id
    into v_workspace_id
  from public.arena_threads t
  where t.id = p_thread_id;

  if v_workspace_id is null then
    raise exception 'Thread not found.';
  end if;

  if not exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = v_workspace_id
      and wm.user_id = v_user_id
      and wm.role = 'owner'
  ) then
    raise exception 'Forbidden.';
  end if;

  select exists (
    select 1
    from public.arena_votes av
    where av.workspace_id = v_workspace_id
      and av.thread_id = p_thread_id
  )
    into v_votes_exist;

  if v_votes_exist and not coalesce(p_reset_votes, false) then
    raise exception 'Votes already exist. Pass p_reset_votes=true to replace the vote profile.';
  end if;

  if v_votes_exist and coalesce(p_reset_votes, false) then
    delete from public.arena_votes av
    where av.workspace_id = v_workspace_id
      and av.thread_id = p_thread_id;
  end if;

  update public.arena_threads
  set
    vote_prompt = v_prompt,
    vote_labels = p_vote_labels,
    referee_report = null,
    referee_report_updated_at = null
  where id = p_thread_id
    and workspace_id = v_workspace_id;

  if not found then
    raise exception 'Thread not found.';
  end if;
end;
$$;

revoke all on function public.set_thread_vote_profile(uuid, text, jsonb, boolean) from public;
grant execute on function public.set_thread_vote_profile(uuid, text, jsonb, boolean) to authenticated;
