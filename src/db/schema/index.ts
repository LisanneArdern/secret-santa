import {
  boolean,
  integer,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

// Mirrors the state names in src/domain/round-lifecycle/state-machine.ts.
// Kept in sync by hand since the Postgres enum and the TypeScript union
// aren't generated from one another.
export const roundStateEnum = pgEnum("round_state", [
  "draft",
  "open",
  "drawn",
  "completed",
  "archived",
  "cancelled",
]);

export const invitationStatusEnum = pgEnum("invitation_status", [
  "invited",
  "joined",
  "revoked",
  "expired",
  "undeliverable",
]);

export const participantStatusEnum = pgEnum("participant_status", [
  "joined",
  "ready",
  "declined",
  "removed",
]);

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    displayName: text("display_name"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [uniqueIndex("users_email_unique").on(table.email)],
);

export const rounds = pgTable("rounds", {
  id: uuid("id").primaryKey().defaultRandom(),
  organiserId: uuid("organiser_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  budgetAmount: numeric("budget_amount", { precision: 10, scale: 2 }),
  budgetCurrency: text("budget_currency"),
  signupDeadline: timestamp("signup_deadline", { withTimezone: true }).notNull(),
  wishesRequired: boolean("wishes_required").notNull().default(false),
  exchangeDate: timestamp("exchange_date", { withTimezone: true }),
  exchangePlace: text("exchange_place"),
  organiserParticipates: boolean("organiser_participates").notNull().default(true),
  state: roundStateEnum("state").notNull().default("draft"),
  // The drawVersion currently in effect; null until the first draw.
  // Earlier-version assignment rows are kept (for the redraw history) but
  // are never shown — only rows matching this value count (SPEC.md:
  // "drawVersion increments on each redraw; only the latest counts").
  currentDrawVersion: integer("current_draw_version"),
  // Set once the signup-deadline-approaching reminder (SPEC.md
  // Notifications) has gone out, so the daily cron job sends it exactly
  // once per round rather than once per day inside the reminder window.
  signupReminderSentAt: timestamp("signup_reminder_sent_at", { withTimezone: true }),
});

export const invitations = pgTable(
  "invitations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    roundId: uuid("round_id")
      .notNull()
      .references(() => rounds.id, { onDelete: "cascade" }),
    // Null for link invites; set and immutable for email invites.
    email: text("email"),
    token: text("token").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    status: invitationStatusEnum("status").notNull().default("invited"),
  },
  (table) => [uniqueIndex("invitations_token_unique").on(table.token)],
);

export const participants = pgTable(
  "participants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    roundId: uuid("round_id")
      .notNull()
      .references(() => rounds.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    status: participantStatusEnum("status").notNull().default("joined"),
    joinedAt: timestamp("joined_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // AC-EDGE-01: joining a round twice never creates a duplicate participant.
    uniqueIndex("participants_round_user_unique").on(table.roundId, table.userId),
  ],
);

// Wishes and notes live in their own table, deliberately separate from
// `participants`. The privacy model needs the organiser to see *that* a
// participant has added wishes (readiness, via this table's existence)
// without ever being able to read the content (SPEC.md: "Wishes and notes
// are visible only to the participant themselves and to their giver...
// The organiser only sees whether each participant has added wishes").
// Row-level security can't express "hide this column from this row's own
// visible reader" — splitting the table makes "the organiser's query never
// touches this table" the enforcement mechanism, with RLS on top of that
// as defense-in-depth for the owner/giver boundary.
export const participantWishes = pgTable("participant_wishes", {
  participantId: uuid("participant_id")
    .primaryKey()
    .references(() => participants.id, { onDelete: "cascade" }),
  wishes: text("wishes"),
  notes: text("notes"),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// Directional: giverId must not be assigned receiverId. Both reference the
// per-round participant row (not the user directly) so that removing a
// participant cascades to delete exclusions referencing them (AC-EDGE-02).
export const exclusions = pgTable("exclusions", {
  id: uuid("id").primaryKey().defaultRandom(),
  roundId: uuid("round_id")
    .notNull()
    .references(() => rounds.id, { onDelete: "cascade" }),
  giverId: uuid("giver_id")
    .notNull()
    .references(() => participants.id, { onDelete: "cascade" }),
  receiverId: uuid("receiver_id")
    .notNull()
    .references(() => participants.id, { onDelete: "cascade" }),
});

export const assignments = pgTable("assignments", {
  id: uuid("id").primaryKey().defaultRandom(),
  roundId: uuid("round_id")
    .notNull()
    .references(() => rounds.id, { onDelete: "cascade" }),
  giverId: uuid("giver_id")
    .notNull()
    .references(() => participants.id, { onDelete: "cascade" }),
  receiverId: uuid("receiver_id")
    .notNull()
    .references(() => participants.id, { onDelete: "cascade" }),
  drawVersion: integer("draw_version").notNull(),
});
