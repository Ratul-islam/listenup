/** "90 minutes", "40 hours", "1.5 hours": an allowance as people say it */
export function formatAllowance(minutes: number) {
  if (minutes < 120) return `${minutes} minutes`;
  const hours = Math.round((minutes / 60) * 10) / 10;
  return `${hours} hours`;
}

/** Time left on a meter: "42 min", "12 h 5 min" */
export function formatTimeLeft(sec: number) {
  const m = Math.floor(sec / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return m % 60 ? `${h} h ${m % 60} min` : `${h} h`;
}

/** "1 November" from "YYYY-MM-DD" */
export function formatResetDate(day: string) {
  const d = new Date(`${day}T00:00:00Z`);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', timeZone: 'UTC' });
}
