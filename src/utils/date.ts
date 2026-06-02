/**
 * Format a remaining duration into a human-readable string.
 * e.g. "2 days, 5 hours, 30 minutes"
 */
export function formatTimeRemaining(endTime: Date): string {
  const now = new Date();
  const diff = endTime.getTime() - now.getTime();

  if (diff <= 0) return "Ended";

  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

  const parts: string[] = [];
  if (days > 0) parts.push(`${days} day${days !== 1 ? "s" : ""}`);
  if (hours > 0) parts.push(`${hours} hour${hours !== 1 ? "s" : ""}`);
  if (minutes > 0) parts.push(`${minutes} min${minutes !== 1 ? "s" : ""}`);

  return parts.length > 0 ? parts.join(", ") : "Less than a minute";
}

/**
 * Format a Date as a display string (UTC).
 */
export function formatDate(date: Date): string {
  return date.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
    timeZoneName: "short",
  });
}

/**
 * Parse a date string that users might enter.
 * Supports: "2024-12-31 23:59", "2024-12-31T23:59:00Z", etc.
 * Returns null if invalid.
 */
export function parseUserDate(input: string): Date | null {
  const trimmedInput = input.trim();

  if (!trimmedInput) return null;

  const commonFormatMatch = trimmedInput.match(
    /^(\d{4})-(\d{1,2})-(\d{1,2})\s+(\d{1,2}):(\d{2})$/
  );
  if (commonFormatMatch) {
    const [, year, month, day, hour, minute] = commonFormatMatch;
    const yearNumber = parseInt(year!, 10);
    const monthNumber = parseInt(month!, 10);
    const dayNumber = parseInt(day!, 10);
    const hourNumber = parseInt(hour!, 10);
    const minuteNumber = parseInt(minute!, 10);

    if (
      monthNumber < 1 ||
      monthNumber > 12 ||
      dayNumber < 1 ||
      hourNumber > 23 ||
      minuteNumber > 59
    ) {
      return null;
    }

    const date = new Date(
      Date.UTC(
        yearNumber,
        monthNumber - 1,
        dayNumber,
        hourNumber,
        minuteNumber
      )
    );

    if (
      date.getUTCFullYear() === yearNumber &&
      date.getUTCMonth() === monthNumber - 1 &&
      date.getUTCDate() === dayNumber &&
      date.getUTCHours() === hourNumber &&
      date.getUTCMinutes() === minuteNumber
    ) {
      return date;
    }

    return null;
  }

  // Try ISO format first
  const date = new Date(trimmedInput);
  if (!isNaN(date.getTime())) return date;

  return null;
}

/**
 * Check if a date is in the future.
 */
export function isFuture(date: Date): boolean {
  return date.getTime() > Date.now();
}

/**
 * Check if a date is in the past.
 */
export function isPast(date: Date): boolean {
  return date.getTime() < Date.now();
}

/**
 * Calculate the number of days between two dates.
 */
export function daysBetween(date1: Date, date2: Date): number {
  const diff = Math.abs(date2.getTime() - date1.getTime());
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

/**
 * Get milliseconds remaining until a target date.
 * Returns 0 if the date is in the past.
 */
export function msUntil(target: Date): number {
  return Math.max(0, target.getTime() - Date.now());
}
