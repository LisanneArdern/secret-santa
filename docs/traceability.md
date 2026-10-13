# Acceptance criteria traceability

One row per acceptance-criterion ID from `SPEC.md`. Each ID is owned by exactly one roadmap phase (the phase that can actually close it with a test) — no ID appears twice. No feature is done until its row has a test name filled in and passing in CI. Update Test(s) as work lands; don't let this file drift from `SPEC.md` or `ROADMAP.md`.

35 criteria total: 9 Draw, 5 Privacy, 6 Invites and access, 1 Lifecycle, 2 Notifications, 12 Edge cases. (`AC-LIFE-02`, the automatic-draw criterion, was removed when automatic draw mode moved out of scope for v1 — see Decision log, 2026-10-13.)

## Phase 1 — Domain logic (draw + lifecycle, pure)

| ID | Criterion | Test(s) |
| --- | --- | --- |
| AC-DRAW-01 | For any group of 3 or more with a satisfiable exclusion set, every participant gives exactly once and receives exactly once. | `draw.test.ts` "[AC-DRAW-01,02,03] assigns everyone exactly once..."; `draw.property.test.ts` "[AC-DRAW-01,02,03] holds the three invariants..." |
| AC-DRAW-02 | No participant is ever assigned to themselves. | `draw.test.ts` "[AC-DRAW-01,02,03] assigns everyone exactly once..."; `draw.property.test.ts` "[AC-DRAW-01,02,03] holds the three invariants..." |
| AC-DRAW-03 | No assignment violates an exclusion. | `draw.test.ts` "[AC-DRAW-03] never violates an exclusion..."; `draw.property.test.ts` "[AC-DRAW-01,02,03] holds the three invariants..." |
| AC-DRAW-04 | With an unsatisfiable exclusion set, no assignments are stored and the organiser sees which exclusions block the draw. | `draw.test.ts` "[AC-DRAW-04] reports the blocking exclusions..." (both cases) |
| AC-DRAW-05 | With fewer than 3 ready participants, the draw is blocked with a clear message. | `draw.test.ts` "[AC-DRAW-05] blocks the draw with fewer than 3 participants" |
| AC-DRAW-06 | When wishes are required, the draw is blocked while any joined participant has no wishes, and the organiser sees who is not ready. | `readiness.test.ts` "[AC-DRAW-06] blocks when wishes are required..." |
| AC-DRAW-07 | After the organiser removes the participants who are not ready, the draw can run. | `readiness.test.ts` "[AC-DRAW-07] the draw can run once every remaining participant is ready" |
| AC-EDGE-03 | A round cannot be saved with a signup deadline in the past or after the exchange date. | `dates.test.ts` "[AC-EDGE-03] rejects a signup deadline in the past"; "...after the exchange date" |

## Phase 2 — Data model: Drizzle schema + RLS

| ID | Criterion | Test(s) |
| --- | --- | --- |
| AC-PRIV-01 | A participant's API requests can only return their own assignment; requesting another returns 403 or 404. | `rls.test.ts` "[AC-PRIV-01,03] a giver sees only their own current assignment..." |
| AC-PRIV-02 | A participating organiser cannot see any assignment but their own, in UI or API. | `rls.test.ts` "[AC-PRIV-02] a participating organiser sees only their own assignment..." |
| AC-PRIV-03 | Nobody can find out who drew them. | `rls.test.ts` "[AC-PRIV-01,03] a giver sees only their own current assignment..." |
| AC-PRIV-04 | A participant's wishes and notes are only returned to them and to their giver, never to other participants or the organiser. | `rls.test.ts` "[AC-PRIV-04] wishes are visible to their owner and their current giver..." |
| AC-EDGE-11 | A user in two rounds only ever sees the giftee that belongs to the round they are viewing. | `rls.test.ts` "[AC-EDGE-11] a user who is a giver in two rounds only sees each round's own giftee" |

## Phase 3 — Auth & invitations

| ID | Criterion | Test(s) |
| --- | --- | --- |
| AC-INV-01 | A valid invite link lets a signed-in user join the round directly, without approval. | `invitations-accept.test.ts` "[AC-INV-01] a link invite (no bound email) can be accepted by any signed-in user, directly" |
| AC-INV-02 | A revoked or expired invite link cannot be used to join. | `invitations-accept.test.ts` "[AC-INV-02] a revoked invite cannot be used to join"; "...an expired invite..." |
| AC-INV-03 | An email invite can only be accepted by that email address. | `invitations-accept.test.ts` "[AC-INV-03] an email invite is rejected for a different signed-in email"; `validate-acceptance.test.ts` "[AC-INV-03] rejects an email invite when the signed-in email doesn't match" |
| AC-INV-04 | A magic link works once and expires after a short window. | `auth-confirm.test.ts` "[AC-INV-04] verifies a real magic link once, and rejects reuse" |
| AC-INV-05 | Only the organiser can create, edit or delete exclusions. | `exclusions-rls.test.ts` "[AC-INV-05] a participant cannot create, read, or delete an exclusion" |
| AC-INV-06 | The organiser can remove any participant until the round is completed; the removed person is notified. | RLS: `participants_update` policy (`20261013220000_phase3_participant_removal_window.sql`) — "removed person is notified" closes in Phase 6 (email) |
| AC-EDGE-01 | Inviting an already invited email, or joining a round twice, never creates a duplicate participant. | `invitations-accept.test.ts` "[AC-EDGE-01] accepting the same invite twice doesn't create a duplicate participant" |
| AC-EDGE-09 | Fetching a magic link URL without pressing confirm does not use up the token. | `auth-confirm.test.ts` "[AC-EDGE-09] exports no GET handler, so a plain link open can never consume the token" — full HTTP-level proof lands with Phase 8's e2e journeys once the confirm page (Phase 5) exists |
| AC-EDGE-10 | An organiser with an open or drawn round cannot delete their account. | `account-deletion.test.ts` "[AC-EDGE-10] blocks deletion while organising an open round"; "...a drawn round, allows it once cancelled"; `validate-deletion.test.ts` |

## Phase 4 — API routes for round lifecycle & participation

| ID | Criterion | Test(s) |
| --- | --- | --- |
| AC-LIFE-01 | Settings cannot be changed after the draw. | `round-settings.test.ts` "[AC-LIFE-01] rejects settings edits once the round has been drawn" |
| AC-DRAW-08 | A redraw increments drawVersion and only the latest version is ever shown. | `round-draw.test.ts` "[AC-DRAW-08] a redraw increments drawVersion and the giver only ever sees the latest" |
| AC-DRAW-09 | Removing a participant after the draw triggers a full redraw for all remaining participants. | `round-remove-participant.test.ts` "[AC-DRAW-09] removing a participant after the draw triggers a full redraw for everyone remaining" |
| AC-EDGE-02 | Removing a participant also removes every exclusion that references them. | `round-remove-participant.test.ts` "[AC-EDGE-02] deletes exclusions referencing the removed participant" |
| AC-EDGE-05 | Concurrent draw requests for one round produce exactly one set of assignments. | `round-draw.test.ts` "[AC-EDGE-05] concurrent draw requests produce exactly one set of assignments"; "...concurrent redraw requests also produce exactly one result" |
| AC-EDGE-06 | A settings change submitted during a running draw is rejected. | `round-settings.test.ts` "[AC-EDGE-06] a settings edit racing a draw loses once the draw commits first" |
| AC-EDGE-12 | Removing a participant after the draw is blocked if fewer than 3 people would remain. | `round-remove-participant.test.ts` "[AC-EDGE-12] blocks removal after the draw if fewer than 3 would remain" |

## Phase 5 — UI screens

| ID | Criterion | Test(s) |
| --- | --- | --- |
| AC-EDGE-04 | HTML in wishes is rendered as text, never executed. | |

## Phase 6 — Notifications (Resend)

| ID | Criterion | Test(s) |
| --- | --- | --- |
| AC-NOTIF-01 | After a successful draw or redraw, each participant receives exactly one email naming only their own giftee. | |
| AC-NOTIF-02 | When a giftee edits wishes after the draw, only their giver is notified. | |
| AC-EDGE-08 | A bounced invite is flagged to the organiser. | |

## Phase 7 — Scheduled jobs (Vercel Cron)

| ID | Criterion | Test(s) |
| --- | --- | --- |
| AC-PRIV-05 | 60 days after the exchange date, all personal data of the round is deleted. | |
| AC-EDGE-07 | Deadlines trigger at the same moment regardless of the viewer's timezone. | |

## Phase 8 — E2E journeys, accessibility, CI hardening

No criterion is solely owned here — this phase verifies the 5 end-to-end journeys and accessibility across all screens, and confirms every row above has a linked test before v1 is considered done.
