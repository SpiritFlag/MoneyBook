export const MIN_YEAR = 1900;
export const MAX_YEAR = 9999;

export function parseDateQuery(value: string | null): string | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split("-");
  return parseDateParts(year, month, day);
}

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
  // Native date fields emit an empty value while a date segment is being edited.
  // Keep that draft intact; validation belongs to save, not render-time arithmetic.
  if (parseDateQuery(value) === null || !Number.isSafeInteger(days)) return value;
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  if (!Number.isFinite(date.getTime()) || date.getUTCFullYear() < MIN_YEAR || date.getUTCFullYear() > MAX_YEAR) return value;
  return date.toISOString().slice(0, 10);
}

export function todayInSeoul(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now);
  const value = (type: string) => parts.find((part) => part.type === type)!.value;
  return `${value("year")}-${value("month")}-${value("day")}`;
}

export function displayDate(value: string): string {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "UTC", month: "long", day: "numeric", weekday: "long",
  }).format(new Date(`${value}T00:00:00Z`));
}

// 장부의 하루는 한국 시간 05:00부터 다음 날 04:59까지입니다.
// 실제 날짜·시각과 은행 원장은 바꾸지 않습니다. 모르는 시각은 추정하지 않습니다.
export function bookDate(date: string, time: string | null | undefined): string {
  return time && time < "05:00" ? shiftDate(date, -1) : date;
}
export function todayInBook(now = new Date()): string {
  return todayInSeoul(new Date(now.getTime() - 5 * 60 * 60 * 1000));
}
export function bookTimeOrder(time: string | null): number {
  if (time === null) return 1440;
  const [h, m, s = 0] = time.split(":").map(Number);
  return (h * 60 + m + s / 60 - 300 + 1440) % 1440;
}
