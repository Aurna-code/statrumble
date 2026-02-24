create or replace function public.set_decision_public(p_decision_id uuid, p_public boolean)
returns table(public_id uuid, is_public boolean)
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_user_id uuid;
  v_workspace_id uuid;
  v_is_owner boolean;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'Unauthorized.';
  end if;

  select dc.workspace_id
    into v_workspace_id
  from public.decision_cards dc
  where dc.id = p_decision_id;

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

  update public.decision_cards dc
    set is_public = p_public,
        public_at = case when p_public then now() else null end,
        public_id = case
          when p_public then coalesce(dc.public_id, gen_random_uuid())
          else dc.public_id
        end,
        updated_at = now()
  where dc.id = p_decision_id
  returning dc.public_id, dc.is_public
    into public_id, is_public;

  if not found then
    raise exception 'Decision not found.';
  end if;

  return next;
end;
$function$;

revoke all on function public.set_decision_public(uuid, boolean) from public;
grant execute on function public.set_decision_public(uuid, boolean) to authenticated;
