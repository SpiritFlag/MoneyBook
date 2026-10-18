export const MIN_YEAR = 1900;
export const MAX_YEAR = 9999;

// 날짜만 다룹니다. UTC로 계산해 시간대·서머타임 때문에 하루가 밀리지 않게 합니다.
export function parseDateParts(year: string, month: string, day: string): string | null {
  if (![year, month, day].every((part) => /^\d+$/.test(part))) return null;
  const [y, m, d] = [Number(year), Number(month), Number(day)];
  if (y < MIN_YEAR || y > MAX_YEAR || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export function shiftDate(value: string, days: number): string {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  if (date.getUTCFullYear() < MIN_YEAR || date.getUTCFullYear() > MAX_YEAR) return value;
  return date.toISOString().slice(0, 10);
}

export function todayInSeoul(): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const value = (type: string) => parts.find((part) => part.type === type)!.value;
  return `${value("year")}-${value("month")}-${value("day")}`;
}

export function displayDate(value: string): string {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "UTC", month: "long", day: "numeric", weekday: "long",
  }).format(new Date(`${value}T00:00:00Z`));
}
