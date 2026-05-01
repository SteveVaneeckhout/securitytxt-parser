// RFC 3339 requires an explicit UTC offset (Z or ±HH:MM). Bare local times are rejected.
const RFC3339_OFFSET = /([Zz]|[+-]\d{2}:\d{2})$/;

export function parseRfc3339(value: string): Date | null {
  const trimmed = value.trim();
  if (!RFC3339_OFFSET.test(trimmed)) return null;
  const ts = Date.parse(trimmed);
  if (isNaN(ts)) return null;
  return new Date(ts);
}

export function isExpired(date: Date, now: Date): boolean {
  return date.getTime() <= now.getTime();
}

export function isMoreThanOneYearAhead(date: Date, now: Date): boolean {
  const oneYearAhead = new Date(now);
  oneYearAhead.setFullYear(oneYearAhead.getFullYear() + 1);
  return date.getTime() > oneYearAhead.getTime();
}

export function daysUntil(date: Date, now: Date): number {
  const ms = date.getTime() - now.getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}
