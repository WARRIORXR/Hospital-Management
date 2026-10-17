const HOSPITAL_TIME_ZONE = "Asia/Kolkata";

/**
 * Deterministic clock formatting.
 *
 * `Date.prototype.toLocaleTimeString([])` uses the runtime's default locale, so
 * the server and the browser can disagree ("09:41:02 PM" vs "09:41:02 pm") and
 * React reports a hydration mismatch. Pinning the locale and hospital timezone
 * keeps both renders identical.
 */
export function formatClock(value: Date | string | number | null): string {
  if (value === null) return "";

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  return new Intl.DateTimeFormat("en-GB", {
    timeZone: HOSPITAL_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date);
}

/** 24 Oct 2026, 09:41 (hospital time). */
export function formatDateTime(value: Date | string | number | null): string {
  if (value === null) return "";

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  return new Intl.DateTimeFormat("en-GB", {
    timeZone: HOSPITAL_TIME_ZONE,
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}
