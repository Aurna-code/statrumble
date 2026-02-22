-- Phase 1 authz hardening:
-- 1) Stop auto-adding all new users to the default workspace.
-- 2) Tighten RLS policies to enforce membership + relational consistency.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- Membership is now explicit (invite/join flow), not automatic.
  return new;
end;
$$;

drop policy if exists metric_imports_select_member on public.metric_imports;
create policy metric_imports_select_member
  on public.metric_imports
  for select
  using (
    exists (
      select 1
      from public.workspace_members wm
      where wm.workspace_id = metric_imports.workspace_id
        and wm.user_id = auth.uid()
    )
    and exists (
      select 1
      from public.metrics m
      where m.id = metric_imports.metric_id
        and m.workspace_id = metric_imports.workspace_id
    )
  );

drop policy if exists metric_imports_insert_member on public.metric_imports;
create policy metric_imports_insert_member
  on public.metric_imports
  for insert
  with check (
    exists (
      select 1
      from public.workspace_members wm
      where wm.workspace_id = metric_imports.workspace_id
        and wm.user_id = auth.uid()
    )
    and exists (
      select 1
      from public.metrics m
      where m.id = metric_imports.metric_id
        and m.workspace_id = metric_imports.workspace_id
    )
  );

drop policy if exists metric_imports_update_member on public.metric_imports;
create policy metric_imports_update_member
  on public.metric_imports
  for update
  using (
    exists (
      select 1
      from public.workspace_members wm
      where wm.workspace_id = metric_imports.workspace_id
        and wm.user_id = auth.uid()
    )
    and exists (
      select 1
      from public.metrics m
      where m.id = metric_imports.metric_id
        and m.workspace_id = metric_imports.workspace_id
    )
  )
  with check (
    exists (
      select 1
      from public.workspace_members wm
      where wm.workspace_id = metric_imports.workspace_id
        and wm.user_id = auth.uid()
    )
    and exists (
      select 1
      from public.metrics m
      where m.id = metric_imports.metric_id
        and m.workspace_id = metric_imports.workspace_id
    )
  );

drop policy if exists metric_imports_delete_member on public.metric_imports;
create policy metric_imports_delete_member
  on public.metric_imports
  for delete
  using (
    exists (
      select 1
      from public.workspace_members wm
      where wm.workspace_id = metric_imports.workspace_id
        and wm.user_id = auth.uid()
    )
    and exists (
      select 1
      from public.metrics m
      where m.id = metric_imports.metric_id
        and m.workspace_id = metric_imports.workspace_id
    )
  );

drop policy if exists metric_points_select_member on public.metric_points;
create policy metric_points_select_member
  on public.metric_points
  for select
  using (
    exists (
      select 1
      from public.metric_imports mi
      join public.workspace_members wm on wm.workspace_id = mi.workspace_id
      where mi.id = metric_points.import_id
        and mi.workspace_id = metric_points.workspace_id
        and wm.user_id = auth.uid()
    )
  );

drop policy if exists metric_points_insert_member on public.metric_points;
create policy metric_points_insert_member
  on public.metric_points
  for insert
  with check (
    exists (
      select 1
      from public.metric_imports mi
      join public.workspace_members wm on wm.workspace_id = mi.workspace_id
      where mi.id = metric_points.import_id
        and mi.workspace_id = metric_points.workspace_id
        and wm.user_id = auth.uid()
    )
  );

drop policy if exists metric_points_update_member on public.metric_points;
create policy metric_points_update_member
  on public.metric_points
  for update
  using (
    exists (
      select 1
      from public.metric_imports mi
      join public.workspace_members wm on wm.workspace_id = mi.workspace_id
      where mi.id = metric_points.import_id
        and mi.workspace_id = metric_points.workspace_id
        and wm.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.metric_imports mi
      join public.workspace_members wm on wm.workspace_id = mi.workspace_id
      where mi.id = metric_points.import_id
        and mi.workspace_id = metric_points.workspace_id
        and wm.user_id = auth.uid()
    )
  );

drop policy if exists metric_points_delete_member on public.metric_points;
create policy metric_points_delete_member
  on public.metric_points
  for delete
  using (
    exists (
      select 1
      from public.metric_imports mi
      join public.workspace_members wm on wm.workspace_id = mi.workspace_id
      where mi.id = metric_points.import_id
        and mi.workspace_id = metric_points.workspace_id
        and wm.user_id = auth.uid()
    )
  );

drop policy if exists arena_threads_select_member on public.arena_threads;
create policy arena_threads_select_member
  on public.arena_threads
  for select
  using (
    exists (
      select 1
      from public.workspace_members wm
      where wm.workspace_id = arena_threads.workspace_id
        and wm.user_id = auth.uid()
    )
    and exists (
      select 1
      from public.metric_imports mi
      where mi.id = arena_threads.import_id
        and mi.workspace_id = arena_threads.workspace_id
    )
    and (
      arena_threads.metric_id is null
      or exists (
        select 1
        from public.metrics m
        where m.id = arena_threads.metric_id
          and m.workspace_id = arena_threads.workspace_id
      )
    )
  );

drop policy if exists arena_threads_insert_member on public.arena_threads;
create policy arena_threads_insert_member
  on public.arena_threads
  for insert
  with check (
    exists (
      select 1
      from public.workspace_members wm
      where wm.workspace_id = arena_threads.workspace_id
        and wm.user_id = auth.uid()
    )
    and exists (
      select 1
      from public.metric_imports mi
      where mi.id = arena_threads.import_id
        and mi.workspace_id = arena_threads.workspace_id
    )
    and (
      arena_threads.metric_id is null
      or exists (
        select 1
        from public.metrics m
        where m.id = arena_threads.metric_id
          and m.workspace_id = arena_threads.workspace_id
      )
    )
  );

drop policy if exists arena_threads_update_member on public.arena_threads;
create policy arena_threads_update_member
  on public.arena_threads
  for update
  using (
    exists (
      select 1
      from public.workspace_members wm
      where wm.workspace_id = arena_threads.workspace_id
        and wm.user_id = auth.uid()
    )
    and exists (
      select 1
      from public.metric_imports mi
      where mi.id = arena_threads.import_id
        and mi.workspace_id = arena_threads.workspace_id
    )
    and (
      arena_threads.metric_id is null
      or exists (
        select 1
        from public.metrics m
        where m.id = arena_threads.metric_id
          and m.workspace_id = arena_threads.workspace_id
      )
    )
  )
  with check (
    exists (
      select 1
      from public.workspace_members wm
      where wm.workspace_id = arena_threads.workspace_id
        and wm.user_id = auth.uid()
    )
    and exists (
      select 1
      from public.metric_imports mi
      where mi.id = arena_threads.import_id
        and mi.workspace_id = arena_threads.workspace_id
    )
    and (
      arena_threads.metric_id is null
      or exists (
        select 1
        from public.metrics m
        where m.id = arena_threads.metric_id
          and m.workspace_id = arena_threads.workspace_id
      )
    )
  );

drop policy if exists arena_threads_delete_member on public.arena_threads;
create policy arena_threads_delete_member
  on public.arena_threads
  for delete
  using (
    exists (
      select 1
      from public.workspace_members wm
      where wm.workspace_id = arena_threads.workspace_id
        and wm.user_id = auth.uid()
    )
    and exists (
      select 1
      from public.metric_imports mi
      where mi.id = arena_threads.import_id
        and mi.workspace_id = arena_threads.workspace_id
    )
    and (
      arena_threads.metric_id is null
      or exists (
        select 1
        from public.metrics m
        where m.id = arena_threads.metric_id
          and m.workspace_id = arena_threads.workspace_id
      )
    )
  );

drop policy if exists arena_messages_select_member on public.arena_messages;
create policy arena_messages_select_member
  on public.arena_messages
  for select
  using (
    exists (
      select 1
      from public.arena_threads t
      join public.workspace_members wm on wm.workspace_id = t.workspace_id
      where t.id = arena_messages.thread_id
        and t.workspace_id = arena_messages.workspace_id
        and wm.user_id = auth.uid()
    )
  );

drop policy if exists arena_messages_insert_own on public.arena_messages;
create policy arena_messages_insert_own
  on public.arena_messages
  for insert
  with check (
    user_id = auth.uid()
    and exists (
      select 1
      from public.arena_threads t
      join public.workspace_members wm on wm.workspace_id = t.workspace_id
      where t.id = arena_messages.thread_id
        and t.workspace_id = arena_messages.workspace_id
        and wm.user_id = auth.uid()
    )
  );

drop policy if exists arena_messages_update_own on public.arena_messages;
create policy arena_messages_update_own
  on public.arena_messages
  for update
  using (
    user_id = auth.uid()
    and exists (
      select 1
      from public.arena_threads t
      join public.workspace_members wm on wm.workspace_id = t.workspace_id
      where t.id = arena_messages.thread_id
        and t.workspace_id = arena_messages.workspace_id
        and wm.user_id = auth.uid()
    )
  )
  with check (
    user_id = auth.uid()
    and exists (
      select 1
      from public.arena_threads t
      join public.workspace_members wm on wm.workspace_id = t.workspace_id
      where t.id = arena_messages.thread_id
        and t.workspace_id = arena_messages.workspace_id
        and wm.user_id = auth.uid()
    )
  );

drop policy if exists arena_messages_delete_own on public.arena_messages;
create policy arena_messages_delete_own
  on public.arena_messages
  for delete
  using (
    user_id = auth.uid()
    and exists (
      select 1
      from public.arena_threads t
      join public.workspace_members wm on wm.workspace_id = t.workspace_id
      where t.id = arena_messages.thread_id
        and t.workspace_id = arena_messages.workspace_id
        and wm.user_id = auth.uid()
    )
  );

drop policy if exists arena_votes_select_member on public.arena_votes;
create policy arena_votes_select_member
  on public.arena_votes
  for select
  using (
    exists (
      select 1
      from public.arena_threads t
      join public.workspace_members wm on wm.workspace_id = t.workspace_id
      where t.id = arena_votes.thread_id
        and t.workspace_id = arena_votes.workspace_id
        and wm.user_id = auth.uid()
    )
  );

drop policy if exists arena_votes_insert_own on public.arena_votes;
create policy arena_votes_insert_own
  on public.arena_votes
  for insert
  with check (
    user_id = auth.uid()
    and exists (
      select 1
      from public.arena_threads t
      join public.workspace_members wm on wm.workspace_id = t.workspace_id
      where t.id = arena_votes.thread_id
        and t.workspace_id = arena_votes.workspace_id
        and wm.user_id = auth.uid()
    )
  );

drop policy if exists arena_votes_update_own on public.arena_votes;
create policy arena_votes_update_own
  on public.arena_votes
  for update
  using (
    user_id = auth.uid()
    and exists (
      select 1
      from public.arena_threads t
      join public.workspace_members wm on wm.workspace_id = t.workspace_id
      where t.id = arena_votes.thread_id
        and t.workspace_id = arena_votes.workspace_id
        and wm.user_id = auth.uid()
    )
  )
  with check (
    user_id = auth.uid()
    and exists (
      select 1
      from public.arena_threads t
      join public.workspace_members wm on wm.workspace_id = t.workspace_id
      where t.id = arena_votes.thread_id
        and t.workspace_id = arena_votes.workspace_id
        and wm.user_id = auth.uid()
    )
  );

drop policy if exists arena_votes_delete_member on public.arena_votes;
create policy arena_votes_delete_member
  on public.arena_votes
  for delete
  using (
    user_id = auth.uid()
    and exists (
      select 1
      from public.arena_threads t
      join public.workspace_members wm on wm.workspace_id = t.workspace_id
      where t.id = arena_votes.thread_id
        and t.workspace_id = arena_votes.workspace_id
        and wm.user_id = auth.uid()
    )
  );

drop policy if exists decision_cards_select_member on public.decision_cards;
create policy decision_cards_select_member
  on public.decision_cards
  for select
  using (
    exists (
      select 1
      from public.workspace_members wm
      where wm.workspace_id = decision_cards.workspace_id
        and wm.user_id = auth.uid()
    )
    and (
      decision_cards.thread_id is null
      or exists (
        select 1
        from public.arena_threads t
        where t.id = decision_cards.thread_id
          and t.workspace_id = decision_cards.workspace_id
      )
    )
  );

drop policy if exists decision_cards_insert_member on public.decision_cards;
create policy decision_cards_insert_member
  on public.decision_cards
  for insert
  with check (
    exists (
      select 1
      from public.workspace_members wm
      where wm.workspace_id = decision_cards.workspace_id
        and wm.user_id = auth.uid()
    )
    and (
      decision_cards.thread_id is null
      or exists (
        select 1
        from public.arena_threads t
        where t.id = decision_cards.thread_id
          and t.workspace_id = decision_cards.workspace_id
      )
    )
  );

drop policy if exists decision_cards_update_member on public.decision_cards;
create policy decision_cards_update_member
  on public.decision_cards
  for update
  using (
    exists (
      select 1
      from public.workspace_members wm
      where wm.workspace_id = decision_cards.workspace_id
        and wm.user_id = auth.uid()
    )
    and (
      decision_cards.thread_id is null
      or exists (
        select 1
        from public.arena_threads t
        where t.id = decision_cards.thread_id
          and t.workspace_id = decision_cards.workspace_id
      )
    )
  )
  with check (
    exists (
      select 1
      from public.workspace_members wm
      where wm.workspace_id = decision_cards.workspace_id
        and wm.user_id = auth.uid()
    )
    and (
      decision_cards.thread_id is null
      or exists (
        select 1
        from public.arena_threads t
        where t.id = decision_cards.thread_id
          and t.workspace_id = decision_cards.workspace_id
      )
    )
  );

drop policy if exists decision_cards_delete_member on public.decision_cards;
create policy decision_cards_delete_member
  on public.decision_cards
  for delete
  using (
    exists (
      select 1
      from public.workspace_members wm
      where wm.workspace_id = decision_cards.workspace_id
        and wm.user_id = auth.uid()
    )
    and (
      decision_cards.thread_id is null
      or exists (
        select 1
        from public.arena_threads t
        where t.id = decision_cards.thread_id
          and t.workspace_id = decision_cards.workspace_id
      )
    )
  );
