import crypto from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { runDraw, type Exclusion, type Participant } from "@/domain/draw/draw";
import { checkDrawReadiness } from "@/domain/draw/readiness";
import { createSeededRandom } from "@/domain/draw/random";

export type PerformDrawOutcome =
  | { kind: "drawn"; drawVersion: number }
  | { kind: "not_ready"; notReadyParticipantIds: string[] }
  | { kind: "too_few_participants"; actual: number; minimumRequired: number }
  | { kind: "infeasible_exclusions"; blockingParticipantIds: string[] };

/**
 * Computes a draw/redraw and writes the resulting assignments at
 * `drawVersion`. Shared by the draw endpoint and the remove-participant
 * endpoint's "always triggers a full redraw" behaviour (AC-DRAW-09) — same
 * orchestration either way, only the caller differs.
 *
 * Does not itself touch `rounds.state` or `rounds.current_draw_version` —
 * callers are responsible for that, since the draw endpoint needs it gated
 * behind an atomic claim (see its route) while the removal endpoint can
 * commit it directly.
 */
export async function performDraw(
  admin: SupabaseClient,
  round: { id: string; wishes_required: boolean },
  drawVersion: number,
): Promise<PerformDrawOutcome> {
  const { data: participantRows, error: participantsError } = await admin
    .from("participants")
    .select("id, status, participant_wishes(participant_id)")
    .eq("round_id", round.id)
    .not("status", "in", "(declined,removed)");
  if (participantsError) {
    throw new Error(`performDraw: failed to load participants — ${participantsError.message}`);
  }

  const rows = participantRows ?? [];

  if (round.wishes_required) {
    const readiness = checkDrawReadiness(
      rows.map((p) => ({
        id: p.id as string,
        hasWishes: Array.isArray(p.participant_wishes)
          ? p.participant_wishes.length > 0
          : Boolean(p.participant_wishes),
      })),
      true,
    );
    if (!readiness.ready) {
      return { kind: "not_ready", notReadyParticipantIds: readiness.notReadyParticipantIds };
    }
  }

  const participants: Participant[] = rows.map((p) => ({ id: p.id as string }));
  const participantIds = new Set(participants.map((p) => p.id));

  const { data: exclusionRows, error: exclusionsError } = await admin
    .from("exclusions")
    .select("giver_id, receiver_id")
    .eq("round_id", round.id);
  if (exclusionsError) {
    throw new Error(`performDraw: failed to load exclusions — ${exclusionsError.message}`);
  }

  const exclusions: Exclusion[] = (exclusionRows ?? [])
    .filter((e) => participantIds.has(e.giver_id) && participantIds.has(e.receiver_id))
    .map((e) => ({ giverId: e.giver_id, receiverId: e.receiver_id }));

  const seed = crypto.randomInt(0, 2 ** 31 - 1);
  const result = runDraw(participants, exclusions, createSeededRandom(seed));

  if (!result.ok) {
    if (result.reason === "too_few_participants") {
      return {
        kind: "too_few_participants",
        actual: result.actual,
        minimumRequired: result.minimumRequired,
      };
    }
    return { kind: "infeasible_exclusions", blockingParticipantIds: result.blockingParticipantIds };
  }

  const { error: insertError } = await admin.from("assignments").insert(
    result.assignments.map((a) => ({
      round_id: round.id,
      giver_id: a.giverId,
      receiver_id: a.receiverId,
      draw_version: drawVersion,
    })),
  );
  if (insertError) {
    throw new Error(`performDraw: failed to write assignments — ${insertError.message}`);
  }

  return { kind: "drawn", drawVersion };
}
