/**
 * FlashStat — Local calendar day helpers (lib/localDate.ts)
 *
 * `new Date().toISOString().split('T')[0]` yields the UTC day, not the viewer's.
 * For a user in Romania (UTC+2/+3) that means between midnight and 03:00 local the
 * app labelled the *previous* day as "AZI" and showed its fixtures.
 */

/** Today's date in the viewer's own timezone, as YYYY-MM-DD. */
export function todayLocalISO(): string {
  return toLocalISO(new Date());
}

/** Formats a Date as YYYY-MM-DD using local (not UTC) calendar fields. */
export function toLocalISO(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Shifts a YYYY-MM-DD string by whole days, staying in local calendar terms. */
export function shiftLocalISO(dateStr: string, deltaDays: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, (m ?? 1) - 1, d ?? 1);
  dt.setDate(dt.getDate() + deltaDays);
  return toLocalISO(dt);
}
