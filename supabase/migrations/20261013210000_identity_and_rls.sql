-- public.users.id is the same id as the corresponding auth.users row (set
-- by the trigger below), so that `auth.uid() = users.id` is a direct
-- comparison everywhere else in this file — drop the random default and
-- tie it to auth.users with a foreign key.
alter table "public"."users" alter column "id" drop default;
alter table "public"."users"
  add constraint "users_id_auth_users_id_fk"
  foreign key ("id") references auth.users (id) on delete cascade;

-- Every new Supabase Auth user (created on first magic-link sign-in, or on
-- accepting an invite with an unknown email — SPEC.md "Authentication")
-- gets a matching public.users profile row automatically.
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users (id, email, display_name)
  values (new.id, new.email, new.raw_user_meta_data ->> 'display_name');
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- Helper functions used by the policies below, marked `security definer` so
-- they read the tables with RLS disabled — calling them from a policy on
-- the same table would otherwise recurse back into RLS evaluation.
create or replace function public.is_round_organiser(p_round_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.rounds r
    where r.id = p_round_id and r.organiser_id = auth.uid()
  );
$$;

-- =========================================================================
-- rounds: visible to its organiser and to anyone who has joined it, since
-- budget/dates/etc. are "shown to all participants" (SPEC.md Round setup).
-- No delete policy: a round is archived (state change), never deleted.
-- =========================================================================
alter table "public"."rounds" enable row level security;

create policy "rounds_select" on "public"."rounds"
  for select
  using (
    organiser_id = auth.uid()
    or exists (
      select 1 from public.participants p
      where p.round_id = rounds.id and p.user_id = auth.uid()
    )
  );

create policy "rounds_insert" on "public"."rounds"
  for insert
  with check (organiser_id = auth.uid());

create policy "rounds_update" on "public"."rounds"
  for update
  using (organiser_id = auth.uid())
  with check (organiser_id = auth.uid());

-- =========================================================================
-- invitations: organiser-managed only. An invitee looking up a round by
-- their invite token before joining isn't authenticated as a participant
-- yet, so that lookup goes through a server route using the service role
-- (bypassing RLS entirely), not through a public RLS policy here.
-- =========================================================================
alter table "public"."invitations" enable row level security;

create policy "invitations_organiser_all" on "public"."invitations"
  for all
  using (public.is_round_organiser(round_id))
  with check (public.is_round_organiser(round_id));

-- =========================================================================
-- participants: visible to the participant themselves and to their round's
-- organiser. No delete policy — "removing" a participant sets status to
-- 'removed' (SPEC.md Participant.status); rows are only bulk-deleted by the
-- 60-day archival job, which runs with the service role.
-- =========================================================================
alter table "public"."participants" enable row level security;

create policy "participants_select" on "public"."participants"
  for select
  using (
    user_id = auth.uid()
    or public.is_round_organiser(round_id)
  );

create policy "participants_insert_self" on "public"."participants"
  for insert
  with check (user_id = auth.uid());

create policy "participants_update" on "public"."participants"
  for update
  using (user_id = auth.uid() or public.is_round_organiser(round_id))
  with check (user_id = auth.uid() or public.is_round_organiser(round_id));

-- =========================================================================
-- participant_wishes: the privacy-critical table. Visible only to the
-- participant who owns it and to their *current-draw-version* giver
-- (SPEC.md: "Wishes and notes are visible only to the participant
-- themselves and to their giver... Nobody else sees them, including the
-- organiser" — the organiser's exclusion from this is structural, since
-- organiser-facing queries never select from this table at all).
-- =========================================================================
alter table "public"."participant_wishes" enable row level security;

create policy "participant_wishes_select" on "public"."participant_wishes"
  for select
  using (
    exists (
      select 1 from public.participants p
      where p.id = participant_wishes.participant_id
        and p.user_id = auth.uid()
    )
    or exists (
      select 1
      from public.participants giftee
      join public.rounds r on r.id = giftee.round_id
      join public.assignments a
        on a.round_id = giftee.round_id
        and a.receiver_id = giftee.id
        and a.draw_version = r.current_draw_version
      join public.participants giver on giver.id = a.giver_id
      where giftee.id = participant_wishes.participant_id
        and giver.user_id = auth.uid()
    )
  );

create policy "participant_wishes_insert_self" on "public"."participant_wishes"
  for insert
  with check (
    exists (
      select 1 from public.participants p
      where p.id = participant_wishes.participant_id
        and p.user_id = auth.uid()
    )
  );

create policy "participant_wishes_update_self" on "public"."participant_wishes"
  for update
  using (
    exists (
      select 1 from public.participants p
      where p.id = participant_wishes.participant_id
        and p.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.participants p
      where p.id = participant_wishes.participant_id
        and p.user_id = auth.uid()
    )
  );

-- =========================================================================
-- exclusions: organiser-only, full stop (SPEC.md AC-INV-05: "Only the
-- organiser can create, edit or delete exclusions").
-- =========================================================================
alter table "public"."exclusions" enable row level security;

create policy "exclusions_organiser_all" on "public"."exclusions"
  for all
  using (public.is_round_organiser(round_id))
  with check (public.is_round_organiser(round_id));

-- =========================================================================
-- assignments: a giver sees only their own current-version assignment. A
-- *non-participating* organiser may see every assignment in their round —
-- SPEC.md's roles table: "See all assignments | Only if not participating".
-- A participating organiser gets no special access here, so they can never
-- see anyone's assignment but their own, same as any other participant.
-- No insert/update/delete policy: only the service role writes assignments,
-- from the draw orchestration in Phase 4.
-- =========================================================================
alter table "public"."assignments" enable row level security;

create policy "assignments_select" on "public"."assignments"
  for select
  using (
    draw_version = (
      select r.current_draw_version from public.rounds r where r.id = assignments.round_id
    )
    and (
      exists (
        select 1 from public.participants p
        where p.id = assignments.giver_id and p.user_id = auth.uid()
      )
      or exists (
        select 1 from public.rounds r
        where r.id = assignments.round_id
          and r.organiser_id = auth.uid()
          and r.organiser_participates = false
      )
    )
  );

-- =========================================================================
-- users: each signed-in user can read and update only their own profile.
-- Round-scoped name lookups (e.g. an organiser's participant list) go
-- through the server using the service role, not a public RLS policy here.
-- =========================================================================
alter table "public"."users" enable row level security;

create policy "users_select_self" on "public"."users"
  for select
  using (id = auth.uid());

create policy "users_update_self" on "public"."users"
  for update
  using (id = auth.uid())
  with check (id = auth.uid());
