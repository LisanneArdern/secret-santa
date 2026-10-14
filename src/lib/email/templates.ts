// SPEC.md "Emails": "follow the same colours and tone, stay short, and
// have one clear button." Email clients don't load external stylesheets,
// so every style here is inline rather than reusing globals.css.
const COLOR_PRIMARY = "#1f5c45";
const COLOR_BACKGROUND = "#fbf8f3";
const COLOR_TEXT = "#1e1e1e";

function renderEmail(options: { heading: string; bodyHtml: string; ctaText: string; ctaUrl: string }): string {
  return `
<div style="background:${COLOR_BACKGROUND};padding:32px 16px;font-family:sans-serif;color:${COLOR_TEXT};">
  <div style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:12px;padding:32px;">
    <h1 style="font-size:22px;margin:0 0 16px;color:${COLOR_PRIMARY};">${options.heading}</h1>
    <div style="font-size:16px;line-height:1.5;">${options.bodyHtml}</div>
    <a href="${options.ctaUrl}" style="display:inline-block;margin-top:24px;padding:12px 24px;background:${COLOR_PRIMARY};color:#ffffff;text-decoration:none;border-radius:8px;font-weight:600;">
      ${options.ctaText}
    </a>
  </div>
</div>`.trim();
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function invitedEmail(options: { roundName: string; organiserName: string; inviteUrl: string }) {
  return {
    subject: `${options.organiserName} invited you to ${options.roundName}`,
    html: renderEmail({
      heading: `You're invited to ${escapeHtml(options.roundName)}`,
      bodyHtml: `<p>${escapeHtml(options.organiserName)} has invited you to join a Secret Santa round.</p>`,
      ctaText: "Join round",
      ctaUrl: options.inviteUrl,
    }),
  };
}

// The draw email names the giftee directly (SPEC.md "Emails": "so people
// who never open the site still get the essential information").
export function drawCompletedEmail(options: { roundName: string; gifteeName: string; roundUrl: string }) {
  return {
    subject: `Your Secret Santa for ${options.roundName}`,
    html: renderEmail({
      heading: "Names have been drawn! 🎁",
      bodyHtml: `<p>You're buying for <strong>${escapeHtml(options.gifteeName)}</strong> in ${escapeHtml(options.roundName)}.</p>`,
      ctaText: "See the details",
      ctaUrl: options.roundUrl,
    }),
  };
}

export function redrawCompletedEmail(options: { roundName: string; gifteeName: string; roundUrl: string }) {
  return {
    subject: `Your Secret Santa for ${options.roundName} has changed`,
    html: renderEmail({
      heading: "Names were drawn again",
      bodyHtml: `<p>The organiser redrew ${escapeHtml(options.roundName)}. You're now buying for <strong>${escapeHtml(options.gifteeName)}</strong>.</p>`,
      ctaText: "See the details",
      ctaUrl: options.roundUrl,
    }),
  };
}

export function removedFromRoundEmail(options: { roundName: string }) {
  return {
    subject: `You've been removed from ${options.roundName}`,
    html: renderEmail({
      heading: "You've been removed",
      bodyHtml: `<p>The organiser removed you from <strong>${escapeHtml(options.roundName)}</strong>. If this was a mistake, reach out to them directly.</p>`,
      ctaText: "View your rounds",
      ctaUrl: `${baseUrl()}/`,
    }),
  };
}

export function wishesUpdatedEmail(options: { roundName: string; gifteeName: string; roundUrl: string }) {
  return {
    subject: `${options.gifteeName} updated their wishes`,
    html: renderEmail({
      heading: "Updated wishes",
      bodyHtml: `<p><strong>${escapeHtml(options.gifteeName)}</strong> updated their wishes for ${escapeHtml(options.roundName)}.</p>`,
      ctaText: "See their wishes",
      ctaUrl: options.roundUrl,
    }),
  };
}

export function signupReminderEmail(options: { roundName: string; daysLeft: number; inviteUrl: string }) {
  const dayWord = options.daysLeft === 1 ? "day" : "days";
  return {
    subject: `${options.daysLeft} ${dayWord} left to join ${options.roundName}`,
    html: renderEmail({
      heading: "Signup closes soon",
      bodyHtml: `<p>You haven't joined <strong>${escapeHtml(options.roundName)}</strong> yet, and signup closes in ${options.daysLeft} ${dayWord}.</p>`,
      ctaText: "Join round",
      ctaUrl: options.inviteUrl,
    }),
  };
}

export function baseUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL ?? "http://127.0.0.1:3000";
}
