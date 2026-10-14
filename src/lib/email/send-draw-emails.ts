import type { SupabaseClient } from "@supabase/supabase-js";
import { sendEmailSafely } from "./send-safely";
import { baseUrl, drawCompletedEmail, redrawCompletedEmail } from "./templates";

// SPEC.md Notifications: "Draw completed | Each participant, with their
// giftee" / "Redraw completed | Each remaining participant, with their
// new giftee". Sends iterate participants individually and each send's
// content comes only from that one assignment row, so "exactly one email,
// naming only that recipient's giftee" is true by construction
// (AC-NOTIF-01) — there's no shared template data one send could leak
// into another's.
export async function sendDrawCompletionEmails(
  admin: SupabaseClient,
  options: { roundId: string; roundName: string; drawVersion: number; isRedraw: boolean },
): Promise<void> {
  const { data: assignments } = await admin
    .from("assignments")
    .select("giver_id, receiver_id")
    .eq("round_id", options.roundId)
    .eq("draw_version", options.drawVersion);
  if (!assignments || assignments.length === 0) return;

  const participantIds = Array.from(new Set(assignments.flatMap((a) => [a.giver_id, a.receiver_id])));
  const { data: participants } = await admin
    .from("participants")
    .select("id, user_id")
    .in("id", participantIds);
  const userIdByParticipantId = new Map((participants ?? []).map((p) => [p.id, p.user_id as string]));

  const userIds = Array.from(new Set((participants ?? []).map((p) => p.user_id as string)));
  const { data: users } = await admin.from("users").select("id, email, display_name").in("id", userIds);
  const userById = new Map((users ?? []).map((u) => [u.id as string, u]));

  const roundUrl = `${baseUrl()}/rounds/${options.roundId}`;

  await Promise.all(
    assignments.map(async (a) => {
      const giverUserId = userIdByParticipantId.get(a.giver_id);
      const receiverUserId = userIdByParticipantId.get(a.receiver_id);
      const giver = giverUserId ? userById.get(giverUserId) : undefined;
      const receiver = receiverUserId ? userById.get(receiverUserId) : undefined;
      if (!giver?.email) return;

      const buildEmail = options.isRedraw ? redrawCompletedEmail : drawCompletedEmail;
      const email = buildEmail({
        roundName: options.roundName,
        gifteeName: (receiver?.display_name as string | null) ?? "your giftee",
        roundUrl,
      });

      await sendEmailSafely({ to: giver.email as string, ...email });
    }),
  );
}
