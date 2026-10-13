# Santa Swap — Implementation Roadmap

This roadmap sequences the build from `SPEC.md`. It follows spec-driven development: every acceptance criterion (AC) in the spec gets a stable ID, tracked in [`docs/traceability.md`](docs/traceability.md), and no feature is done until its criteria map to named, passing tests.

Two decisions locked in here:
- **Package manager:** npm.
- **Scheduled jobs:** Vercel Cron, not Supabase pg_cron — cron routes call the same server-side functions as any other server-side action, keeping domain logic out of SQL. (Draw is manual-only for v1 — see Decision log in `SPEC.md`, 2026-10-13 — so these jobs are limited to reminders and the 60-day archival deletion; there is no automatic-draw trigger to build.)

## Phase 0 — Repo, tooling, CI skeleton

Scaffold with `npm create next-app` (TypeScript, App Router). Note: `create-next-app` refuses to scaffold into a non-empty directory unless every existing entry is on its safelist — `SPEC.md` is not on that list, so scaffold into a temp dir and merge, or move `SPEC.md` aside temporarily and move it back.

Folder layout:
```
src/
  app/          # Next.js routes, pages, API/route handlers
  domain/       # pure, framework-free business logic (draw, lifecycle, validation)
  db/           # Drizzle schema + client
  lib/          # auth helpers, email client wrapper, clock
  emails/       # email templates
supabase/
  migrations/   # SQL migrations incl. RLS policies
tests/
  integration/  # Vitest + Supabase CLI
  e2e/          # Playwright
  factories/    # test data builders
docs/
  traceability.md
```

Install: Vitest, fast-check, Testing Library (+jsdom, user-event), Playwright, @axe-core/playwright, Drizzle + drizzle-kit, Supabase CLI + @supabase/supabase-js, Resend.

Add an ESLint `no-restricted-imports` rule scoped to `src/domain/**` forbidding `react`, `next`, `@/db/*`, `@supabase/*`, `drizzle-orm` — this turns "domain logic has no framework or database imports" into a lint-enforced, CI-checked constraint.

CI (`.github/workflows/ci.yml`): lint → typecheck → unit/property → component → integration (local Supabase) → e2e + a11y. All required checks, merge blocked on failure.

## Phase 1 — Domain logic: draw algorithm + lifecycle state machine

No DB, no UI — pure and testable first because every later phase calls into it rather than re-implementing the rules.

- `src/domain/draw/draw.ts`: `runDraw(participants, exclusions, random: RandomSource): DrawResult`. On failure, names the blocking exclusions (not just "no solution") — needs feasibility checking (Hall's-theorem style) before a randomized matching search, not brute-force shuffle-and-check. Injectable seeded PRNG so failing property tests are replayable with the same seed.
- `src/domain/round-lifecycle/state-machine.ts`: mirrors the Draft/Open/Drawn/Completed/Archived/Cancelled table exactly, including allowed actions per state.
- `src/domain/validation/dates.ts` and `src/domain/validation/wishes.ts`: deadline/exchange-date checks, 2,000-char limit + HTML escaping.

Tests: unit tests for exactly-3-people, impossible exclusions, "everyone excluded from one person"; property tests (fast-check) over random groups (3–30) and exclusion sets asserting the three invariants (gives/receives exactly once, no self-match, no exclusion violated).

**Covers:** `AC-DRAW-01..07`, `AC-EDGE-03` (date validation lives in `src/domain/validation/dates.ts`, same pure-module testability). **Target:** 90%+ coverage on `src/domain`.

`AC-DRAW-08/09` (drawVersion bookkeeping and the redraw-on-removal trigger) are *not* here — they're persistence/orchestration concerns, not part of the pure `runDraw` function, so they're owned by Phase 4 below.

## Phase 2 — Data model: Drizzle schema + RLS

Schema for the 6 entities (User, Round, Invitation, Participant, Exclusion, Assignment incl. `drawVersion`). RLS policies hand-written as companion SQL migrations (Drizzle doesn't manage RLS): Assignment selectable only by `giverId`; wishes/notes selectable only by the owner or by the *current drawVersion's* giver — the trickiest policy in the model, gets its own dedicated test file.

**Spike first:** prove the local Supabase CLI + Vitest integration-test loop works in CI with one table before building all six — this gates the entire integration layer.

**Covers:** `AC-PRIV-01..04`, `AC-EDGE-11` (per-round scoping is the same RLS mechanism that keeps a user's giftee from leaking between rounds).

`AC-PRIV-05` (the 60-day deletion) is *not* here — it's a cron job, not a schema/RLS concern, so it's owned by Phase 7.

## Phase 3 — Auth & invitations

Supabase magic-link auth. **Spike first:** sketch the two-token flow (Supabase auth token vs. app-level `Invitation.token`) across new-user/email-invite, returning-user/email-invite, and link-invite paths — including the scanner-pre-fetch confirm-button requirement and cross-device link completion — before writing the join handler.

Email-bound invites reject on email mismatch; idempotent join handler (unique `(roundId, userId)`). Account deletion is blocked while the user organises an open or drawn round — this is an auth/account-management action, so it lives here too.

**Covers:** `AC-INV-01..06`, `AC-EDGE-01/09/10`.

## Phase 4 — API routes for round lifecycle & participation

Every route: auth check → `canTransition` check from Phase 1 → Drizzle write (RLS as defense-in-depth, not the only check). Draw endpoint takes a DB-level lock so double-click/two-tab triggers produce exactly one result, and the same lock rejects mid-draw settings edits. Each successful draw/redraw writes a new `drawVersion` and reads only ever return the latest. Removal after the draw calls `runDraw` again on the reduced set, cascades exclusion deletes, and is blocked if fewer than 3 people would remain.

**Covers:** `AC-LIFE-01`, `AC-DRAW-08/09`, `AC-EDGE-02/05/06/12`.

## Phase 5 — UI screens

Design tokens from the spec's colour table, verified against WCAG AA before being treated as final. Build the 7 key screens (Sign in, My rounds, Create round, Invite page, Round page × organiser/participant, My giftee) mobile-first: single column, 720px max width, 44×44 tap targets, full-width primary buttons on phone, confirmation + consequence text on destructive actions. Wishes field: 2,000-char limit, HTML-escaped rendering, links open in new tab. Respect `prefers-reduced-motion` for the giftee-reveal animation.

**Covers:** `AC-EDGE-04`, Usability/Accessibility NFRs.

## Phase 6 — Notifications (Resend)

`EmailSender` interface with a Resend implementation and an in-memory fake for tests — same DI pattern as the draw's `RandomSource`. Sends iterate participants individually so "exactly one email, only their own giftee" is true by construction. Bounce webhook flips `Invitation.status` to undeliverable.

**Covers:** `AC-NOTIF-01..02`, `AC-EDGE-08`.

## Phase 7 — Scheduled jobs (Vercel Cron)

Route handlers on a cron schedule: deadline-approaching reminders, and 60-day archival deletion of a round's personal data (participants, wishes, notes, exclusions, assignments) once it moves to Archived. Injectable `Clock` interface (same DI pattern as the draw's `RandomSource`) so deadline/archival logic is tested with a fake clock, never real waiting. Draw is manual-only for v1 (no automatic-draw-at-deadline job — see Decision log, 2026-10-13), so this phase is smaller than originally scoped.

**Covers:** `AC-PRIV-05`, `AC-EDGE-07`.

## Phase 8 — E2E journeys, accessibility, CI hardening

The 5 spec'd Playwright journeys on desktop + mobile viewports; axe scan on all 7 key screens, zero serious/critical violations; coverage gate scoped to `src/domain` + permission/RLS code; confirm all 35 rows in `docs/traceability.md` have a linked test.

## First milestone (cut-down journey 1)

Organiser creates a round, invites 3 people by email, they join via magic link, organiser triggers a manual draw, each person signs in and sees only their own giftee.

Deferred from the milestone: redraw-on-removal, reminders, archival job, wishes-required gating, link invites, bounce handling, full accessibility polish. (Automatic draw mode isn't deferred — it's out of scope for v1 entirely, see Decision log in `SPEC.md`.)

Suggested PR sequence:
1. Scaffold + CI skeleton
2. Draw pure module + tests
3. Lifecycle state machine + tests
4. Drizzle schema + minimal RLS + one smoke integration test
5. Magic-link sign-in
6. Email invite + join flow
7. Create-round + organiser round page
8. Manual draw (with concurrency lock) + "My giftee" screen
9. Resend wiring for invite + draw emails
10. Playwright journey 1 (cut-down) + axe

## Risks to spike early

1. Local Supabase + Vitest RLS testing loop in CI (before Phase 2).
2. The magic-link / invite-token two-token flow (before Phase 3).
3. Draw infeasibility explainability — naming blocking exclusions, not just failing (inside Phase 1).
4. The "current giver" RLS policy for wishes/notes (inside Phase 2).
