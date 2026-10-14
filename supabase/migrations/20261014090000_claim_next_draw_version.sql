-- AC-EDGE-05 ("Concurrent [...] requests for one round produce exactly
-- one set of assignments") has a gap for current_draw_version
-- specifically: unlike the initial draw (a one-way open->drawn
-- transition, so a late-arriving duplicate request always finds the
-- terminal state and short-circuits), current_draw_version is *meant* to
-- keep moving forward across separate, legitimate redraws — so "has it
-- already changed?" can't tell a duplicate request apart from one that's
-- simply reading a moment after the previous redraw fully committed.
-- PostgREST's update() only accepts literal values, so a route-level
-- read-current-version-then-compare-and-swap always has an unavoidable
-- gap between the read and the write for that value to go stale in. This
-- function closes the gap by computing and claiming the next version in
-- one atomic, self-referential UPDATE: the negative sign of
-- current_draw_version is a transient "a redraw is being computed right
-- now" marker, settled back to a plain positive value once the caller's
-- redraw commits (or reverted to its original value if the redraw fails).
create or replace function public.claim_next_draw_version(p_round_id uuid)
returns table (claimed boolean, draw_version integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_version integer;
begin
  update public.rounds
  set current_draw_version = -(coalesce(current_draw_version, 0) + 1)
  where id = p_round_id
    and state = 'drawn'
    and current_draw_version > 0
  returning -current_draw_version into v_version;

  if found then
    return query select true, v_version;
  else
    return query select false, null::integer;
  end if;
end;
$$;

-- Only the server's service-role client calls this (never exposed to end
-- users directly) — lock down PostgREST's default "every role can execute
-- every function" grant.
revoke execute on function public.claim_next_draw_version(uuid) from public, anon, authenticated;
grant execute on function public.claim_next_draw_version(uuid) to service_role;
