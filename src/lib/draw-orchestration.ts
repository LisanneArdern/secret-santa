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

const CLAIM_POLL_INTERVAL_MS = 150;
const CLAIM_POLL_MAX_ATTEMPTS = 20; // ~3s total

export interface DrawVersionClaim {
  claimed: boolean;
  nextVersion: number | null;
}

/**
 * Atomically claims the next current_draw_version for a drawn round, via
 * the claim_next_draw_version migration's self-referential UPDATE — see
 * its comment for why this can't be a read-then-compare-and-swap at the
 * route level. Shared by the redraw endpoint and remove-participant's
 * "always triggers a full redraw" path (AC-DRAW-09), since both advance
 * the same counter and would otherwise be able to race each other.
 * `claimed: false` means another request is already claimed right now —
 * callers should wait (`waitForDrawVersionToSettle`) rather than compute a
 * version of their own.
 */
export async function claimNextDrawVersion(
  admin: SupabaseClient,
  roundId: string,
): Promise<DrawVersionClaim> {
  const { data, error } = await admin.rpc("claim_next_draw_version", { p_round_id: roundId });
  if (error) throw new Error(`claimNextDrawVersion: failed to claim — ${error.message}`);
  const row = data?.[0] as { claimed: boolean; draw_version: number | null } | undefined;
  return { claimed: Boolean(row?.claimed), nextVersion: row?.draw_version ?? null };
}

/** Settles a claim back to a plain positive value once its redraw has committed its assignments. */
export async function settleDrawVersionClaim(
  admin: SupabaseClient,
  roundId: string,
  version: number,
): Promise<void> {
  await admin.from("rounds").update({ current_draw_version: version }).eq("id", roundId);
}

/** Reverts a claim back to its previous value when the draw itself couldn't proceed (not ready, infeasible exclusions, etc). */
export async function revertDrawVersionClaim(
  admin: SupabaseClient,
  roundId: string,
  previousVersion: number,
): Promise<void> {
  await admin.from("rounds").update({ current_draw_version: previousVersion }).eq("id", roundId);
}

/**
 * Waits for an in-progress redraw (current_draw_version momentarily
 * negative) to settle, and returns its final version — for a request that
 * lost the claim, to relay the in-progress redraw's result instead of
 * ever computing one of its own. Returns null if nobody settles it within
 * the timeout (the claiming request crashed or is abnormally slow).
 */
export async function waitForDrawVersionToSettle(
  admin: SupabaseClient,
  roundId: string,
): Promise<number | null> {
  for (let attempt = 0; attempt < CLAIM_POLL_MAX_ATTEMPTS; attempt++) {
    const { data } = await admin
      .from("rounds")
      .select("current_draw_version")
      .eq("id", roundId)
      .maybeSingle();
    const version = data?.current_draw_version ?? null;
    if (version !== null && version > 0) return version;
    await new Promise((resolve) => setTimeout(resolve, CLAIM_POLL_INTERVAL_MS));
  }
  return null;
}
