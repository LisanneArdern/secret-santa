import { describe, expect, it } from "vitest";
import {
  canPerform,
  transition,
  type RoundAction,
  type RoundState,
} from "./state-machine";

const ALL_ACTIONS: RoundAction[] = [
  "edit_settings",
  "add_exclusion",
  "remove_exclusion",
  "open_signup",
  "invite_participant",
  "remove_participant",
  "draw",
  "redraw",
  "edit_wishes",
  "complete",
  "archive",
  "cancel",
];

describe("round lifecycle state machine", () => {
  it("allows exactly the documented actions in draft", () => {
    const allowed = ALL_ACTIONS.filter((action) => canPerform("draft", action));
    expect(allowed.sort()).toEqual(
      ["edit_settings", "add_exclusion", "remove_exclusion", "open_signup", "cancel"].sort(),
    );
  });

  it("allows exactly the documented actions in open", () => {
    const allowed = ALL_ACTIONS.filter((action) => canPerform("open", action));
    expect(allowed.sort()).toEqual(
      [
        "edit_settings",
        "add_exclusion",
        "remove_exclusion",
        "invite_participant",
        "remove_participant",
        "draw",
        "cancel",
      ].sort(),
    );
  });

  it("allows exactly the documented actions in drawn", () => {
    const allowed = ALL_ACTIONS.filter((action) => canPerform("drawn", action));
    expect(allowed.sort()).toEqual(
      ["edit_wishes", "remove_participant", "redraw", "complete"].sort(),
    );
  });

  it.each<RoundState>(["archived", "cancelled"])(
    "allows no actions in %s",
    (state) => {
      const allowed = ALL_ACTIONS.filter((action) => canPerform(state, action));
      expect(allowed).toEqual([]);
    },
  );

  it("allows only the system archive transition in completed (no user actions)", () => {
    const allowed = ALL_ACTIONS.filter((action) => canPerform("completed", action));
    expect(allowed).toEqual(["archive"]);
  });

  it("[AC-LIFE-01 groundwork] rejects edit_settings once the round has moved past open", () => {
    expect(canPerform("drawn", "edit_settings")).toBe(false);
    expect(canPerform("completed", "edit_settings")).toBe(false);
  });

  it("moves draft -> open -> drawn -> completed -> archived", () => {
    expect(transition("draft", "open_signup")).toEqual({ ok: true, state: "open" });
    expect(transition("open", "draw")).toEqual({ ok: true, state: "drawn" });
    expect(transition("drawn", "redraw")).toEqual({ ok: true, state: "drawn" });
    expect(transition("drawn", "complete")).toEqual({ ok: true, state: "completed" });
    expect(transition("completed", "archive")).toEqual({ ok: true, state: "archived" });
  });

  it("moves draft or open -> cancelled", () => {
    expect(transition("draft", "cancel")).toEqual({ ok: true, state: "cancelled" });
    expect(transition("open", "cancel")).toEqual({ ok: true, state: "cancelled" });
  });

  it("leaves the state unchanged for actions that don't transition it", () => {
    expect(transition("open", "invite_participant")).toEqual({
      ok: true,
      state: "open",
    });
  });

  it("rejects an action not allowed in the current state", () => {
    const result = transition("completed", "draw");
    expect(result).toEqual({ ok: false, reason: "action_not_allowed_in_state" });
  });
});
