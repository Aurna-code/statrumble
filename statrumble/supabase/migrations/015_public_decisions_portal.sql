alter table public.decision_cards
  add column if not exists is_public boolean not null default false,
  add column if not exists public_id uuid,
  add column if not exists public_at timestamptz;

create unique index if not exists idx_decision_cards_public_id
  on public.decision_cards (public_id)
  where public_id is not null;

create index if not exists idx_decision_cards_public_state
  on public.decision_cards (is_public, public_at desc);

drop policy if exists decision_cards_select_public on public.decision_cards;
create policy decision_cards_select_public
  on public.decision_cards
  for select
  using (is_public = true and public_id is not null);

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
        and wm.role = 'owner'
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
        and wm.role = 'owner'
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
        and wm.role = 'owner'
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

create or replace function public.set_decision_public(p_decision_id uuid, p_public boolean)
returns table(public_id uuid, is_public boolean)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid;
  v_workspace_id uuid;
  v_is_owner boolean;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'Unauthorized.';
  end if;

  select workspace_id
    into v_workspace_id
  from public.decision_cards
  where id = p_decision_id;

  if v_workspace_id is null then
    raise exception 'Decision not found.';
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

  update public.decision_cards
    set is_public = p_public,
        public_at = case when p_public then now() else null end,
        public_id = case when p_public and public_id is null then gen_random_uuid() else public_id end,
        updated_at = now()
  where id = p_decision_id
  returning decision_cards.public_id, decision_cards.is_public
    into public_id, is_public;

  if not found then
    raise exception 'Decision not found.';
  end if;

  return next;
end;
$$;

revoke all on function public.set_decision_public(uuid, boolean) from public;
grant execute on function public.set_decision_public(uuid, boolean) to authenticated;
