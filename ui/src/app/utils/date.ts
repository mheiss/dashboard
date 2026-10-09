/**
 * Returns if the year, month and day is the same.
 * The time is ignored when comparing.
 */
export function isSameDay(a: Date, b: Date) {
  return a.getFullYear() == b.getFullYear() && a.getMonth() == b.getMonth() && a.getDate() == b.getDate();
}
