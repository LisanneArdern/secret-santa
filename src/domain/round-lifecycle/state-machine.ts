// Mirrors SPEC.md "Round lifecycle": every round is in exactly one state,
// and each action is allowed only in specific states.
export type RoundState =
  | "draft"
  | "open"
  | "drawn"
  | "completed"
  | "archived"
  | "cancelled";

export type RoundAction =
  | "edit_settings"
  | "add_exclusion"
  | "remove_exclusion"
  | "open_signup"
  | "invite_participant"
  | "remove_participant"
  | "draw"
  | "redraw"
  | "edit_wishes"
  | "complete"
  | "archive"
  | "cancel";

// "complete" and "archive" aren't user actions (SPEC.md's lifecycle table
// lists no user-facing actions for Drawn->Completed or Completed->Archived
// — they fire on the exchange date and 60 days after it, respectively) but
// they're still the only actions structurally valid from those states.
const ALLOWED_ACTIONS: Record<RoundState, readonly RoundAction[]> = {
  draft: ["edit_settings", "add_exclusion", "remove_exclusion", "open_signup", "cancel"],
  open: [
    "edit_settings",
    "add_exclusion",
    "remove_exclusion",
    "invite_participant",
    "remove_participant",
    "draw",
    "cancel",
  ],
  drawn: ["edit_wishes", "remove_participant", "redraw", "complete"],
  completed: ["archive"],
  archived: [],
  cancelled: [],
};

// Only actions that move the round to a different state are listed here;
// every other allowed action leaves the state unchanged.
const NEXT_STATE: Partial<Record<RoundAction, RoundState>> = {
  open_signup: "open",
  draw: "drawn",
  redraw: "drawn",
  complete: "completed",
  archive: "archived",
  cancel: "cancelled",
};

export function canPerform(state: RoundState, action: RoundAction): boolean {
  return ALLOWED_ACTIONS[state].includes(action);
}

export type TransitionResult =
  | { ok: true; state: RoundState }
  | { ok: false; reason: "action_not_allowed_in_state" };

export function transition(state: RoundState, action: RoundAction): TransitionResult {
  if (!canPerform(state, action)) {
    return { ok: false, reason: "action_not_allowed_in_state" };
  }
  return { ok: true, state: NEXT_STATE[action] ?? state };
}
