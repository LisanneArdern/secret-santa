-- SPEC.md: "The organiser can remove any participant until the round is
-- completed" (AC-INV-06). Phase 2's participants_update policy let the
-- organiser update a participant in any state; this narrows it so an
-- organiser's write is only allowed while the round hasn't reached
-- completed/archived/cancelled. Self-updates (a participant editing their
-- own row) are unaffected.
drop policy "participants_update" on "public"."participants";

create policy "participants_update" on "public"."participants"
  for update
  using (
    user_id = auth.uid()
    or (
      public.is_round_organiser(round_id)
      and exists (
        select 1 from public.rounds r
        where r.id = round_id
          and r.state not in ('completed', 'archived', 'cancelled')
      )
    )
  )
  with check (
    user_id = auth.uid()
    or (
      public.is_round_organiser(round_id)
      and exists (
        select 1 from public.rounds r
        where r.id = round_id
          and r.state not in ('completed', 'archived', 'cancelled')
      )
    )
  );
