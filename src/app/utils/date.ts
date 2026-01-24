/**
 * Returns if the year is the same.
 * The other parts are ignored when comparing.
 */
export function isSameYear(a: Date, b: Date) {
  return a.getFullYear() == b.getFullYear();
}

/**
 * Returns if the year, month and day is the same.
 * The time is ignored when comparing.
 */
export function isSameDay(a: Date, b: Date) {
  return a.getFullYear() == b.getFullYear() && a.getMonth() == b.getMonth() && a.getDate() == b.getDate();
}

/**
 * Returns if everything to to the minute is the same.
 */
export function isSameMinute(a: Date, b: Date) {
  return isSameDay(a, b) && a.getHours() == b.getHours() && a.getMinutes() == b.getMinutes();
}
