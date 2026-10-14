// Vercel Cron calls these routes directly (no user session), so the only
// thing standing between them and anyone who finds the URL is this shared
// secret. Vercel sends it as `Authorization: Bearer $CRON_SECRET` on every
// cron-triggered request when the CRON_SECRET env var is set — see
// vercel.json for the schedules.
export function isAuthorizedCronRequest(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}
