const SHORT_MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

const LONG_MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/** Calendar date in the server's local timezone, YYYY-MM-DD. */
export function civilFromDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function civilFromIso(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return civilFromDate(new Date());
  return civilFromDate(date);
}

export function addCivilDays(civil: string, days: number): string {
  const [year, month, day] = civil.split("-").map(Number);
  const date = new Date(year, month - 1, day + days);
  return civilFromDate(date);
}

export function daysBetween(fromCivil: string, toCivil: string): number {
  const [fy, fm, fd] = fromCivil.split("-").map(Number);
  const [ty, tm, td] = toCivil.split("-").map(Number);
  const from = Date.UTC(fy, fm - 1, fd);
  const to = Date.UTC(ty, tm - 1, td);
  return Math.round((to - from) / 86_400_000);
}

export function formatCivilLabel(civil: string): string {
  const [year, month, day] = civil.split("-").map(Number);
  if (!year || !month || !day) return civil;
  return `${SHORT_MONTHS[month - 1]} ${day}, ${year}`;
}

export function formatCivilLong(civil: string): string {
  const [year, month, day] = civil.split("-").map(Number);
  if (!year || !month || !day) return civil;
  return `${LONG_MONTHS[month - 1]} ${day}, ${year}`;
}

export function daysLabel(daysLeft: number): string {
  if (daysLeft < 0) {
    const n = Math.abs(daysLeft);
    return n === 1 ? "1 day past" : `${n} days past`;
  }
  if (daysLeft === 0) return "Ends today";
  if (daysLeft === 1) return "1 day left";
  return `${daysLeft} days left`;
}
