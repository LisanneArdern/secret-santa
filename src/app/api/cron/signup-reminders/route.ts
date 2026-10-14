import { NextResponse } from "next/server";
import { isSignupReminderDue } from "@/domain/round-lifecycle/scheduled-transitions";
import { isAuthorizedCronRequest } from "@/lib/cron-auth";
import { sendEmailSafely } from "@/lib/email/send-safely";
import { baseUrl, signupReminderEmail } from "@/lib/email/templates";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";

// SPEC.md Notifications: "Signup deadline approaching (e.g. 3 days
// before) | Invitees not yet ready". Read literally against this app's own
// data model: an invitee who already joined has a participants row and
// nothing left to do, so "not yet ready" means an invitation still
// sitting at status 'invited' — link invites have no email to remind, so
// only email invites are included.
export async function GET(request: Request) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = getSupabaseAdminClient();
  const { data: candidates, error } = await admin
    .from("rounds")
    .select("id, name, state, signup_deadline, signup_reminder_sent_at")
    .eq("state", "open")
    .is("signup_reminder_sent_at", null);
  if (error) return NextResponse.json({ error: "lookup_failed" }, { status: 500 });

  const now = new Date();
  const dueRounds = (candidates ?? []).filter((round) =>
    isSignupReminderDue(
      {
        state: round.state,
        signupDeadline: new Date(round.signup_deadline),
        signupReminderSentAt: round.signup_reminder_sent_at
          ? new Date(round.signup_reminder_sent_at)
          : null,
      },
      now,
    ),
  );

  let remindedCount = 0;

  for (const round of dueRounds) {
    // Claimed before sending anything, the same way the draw endpoints
    // claim before computing (see draw-orchestration.ts) — otherwise two
    // overlapping cron runs could both read signup_reminder_sent_at as
    // still null and both send every invitee a duplicate email.
    const { data: claimed } = await admin
      .from("rounds")
      .update({ signup_reminder_sent_at: now.toISOString() })
      .eq("id", round.id)
      .eq("state", "open")
      .is("signup_reminder_sent_at", null)
      .select("id");
    if (!claimed || claimed.length === 0) continue;

    const { data: invitations } = await admin
      .from("invitations")
      .select("token, email")
      .eq("round_id", round.id)
      .eq("status", "invited")
      .not("email", "is", null);

    const daysLeft = Math.max(
      1,
      Math.ceil((new Date(round.signup_deadline).getTime() - now.getTime()) / (24 * 60 * 60 * 1000)),
    );

    for (const invitation of invitations ?? []) {
      await sendEmailSafely({
        to: invitation.email!,
        ...signupReminderEmail({
          roundName: round.name,
          daysLeft,
          inviteUrl: `${baseUrl()}/invite/${invitation.token}`,
        }),
      });
    }

    remindedCount += 1;
  }

  return NextResponse.json({ remindedRounds: remindedCount });
}
