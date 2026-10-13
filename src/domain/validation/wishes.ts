// Length limit from SPEC.md edge case: "Wishes with very long text, emoji,
// links or HTML" → "Text is length-limited (e.g. 2,000 characters)". HTML
// escaping itself (AC-EDGE-04) is a UI-rendering guarantee (never use
// dangerouslySetInnerHTML), not something this module needs to do.
export const MAX_WISHES_LENGTH = 2000;

export type WishesValidationResult =
  | { ok: true }
  | { ok: false; reason: "too_long"; maxLength: number };

export function validateWishesLength(wishes: string): WishesValidationResult {
  if (wishes.length > MAX_WISHES_LENGTH) {
    return { ok: false, reason: "too_long", maxLength: MAX_WISHES_LENGTH };
  }
  return { ok: true };
}
