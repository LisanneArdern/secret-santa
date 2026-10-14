// SPEC.md's User entity includes displayName, and the My giftee screen
// promises "Giftee name" — but magic-link sign-in never collects one, so
// without this, every giftee reveal and notification email falls back to
// a generic placeholder forever. This is the one place a name gets
// validated before being saved, by the one-time welcome step and any
// later edit.
export const MAX_DISPLAY_NAME_LENGTH = 60;

export type DisplayNameValidationResult =
  | { ok: true; value: string }
  | { ok: false; reason: "empty" | "too_long"; maxLength?: number };

export function validateDisplayName(name: string): DisplayNameValidationResult {
  const trimmed = name.trim();
  if (trimmed.length === 0) {
    return { ok: false, reason: "empty" };
  }
  if (trimmed.length > MAX_DISPLAY_NAME_LENGTH) {
    return { ok: false, reason: "too_long", maxLength: MAX_DISPLAY_NAME_LENGTH };
  }
  return { ok: true, value: trimmed };
}
