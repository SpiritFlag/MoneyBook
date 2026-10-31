import { parseDateQuery } from "./date";
import { expenseInputSchema, type Expense, type ExpenseInput } from "./expense";

export function validMonth(month: string): boolean {
  return /^\d{4}-\d{2}$/.test(month) && parseDateQuery(`${month}-01`) !== null;
}
export function shiftMonth(month: string, count: number): string | null {
  if (!validMonth(month)) return null;
  const date = new Date(`${month}-01T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + count);
  const result = date.toISOString().slice(0, 7);
  return validMonth(result) ? result : null;
}
function moveDate(date: string, months: number): string {
  const month = shiftMonth(date.slice(0, 7), months);
  if (!month) throw new Error("옮길 이용기간이 지원하는 날짜 범위를 벗어나요.");
  const [year, number] = month.split("-").map(Number);
  const last = new Date(Date.UTC(year, number, 0)).getUTCDate();
  const [oldYear, oldMonth, oldDay] = date.split("-").map(Number);
  const wasLast = oldDay === new Date(Date.UTC(oldYear, oldMonth, 0)).getUTCDate();
  return `${month}-${String(wasLast ? last : Math.min(oldDay, last)).padStart(2, "0")}`;
}
export function recurringSeries(expense: ExpenseInput & { id?: string }): string | undefined {
  return expense.recurringSeriesId ?? expense.id;
}
export function recurringRows(expenses: Expense[], month: string) {
  if (!validMonth(month)) return [];
  const previousMonth = shiftMonth(month, -1);
  const groups = new Map<string, Expense[]>();
  for (const expense of expenses) {
    if ((!expense.monthlyRecurring && !expense.recurringSeriesId) || expense.paymentDate.slice(0, 7) > month) continue;
    const key = recurringSeries(expense)!;
    const entries = groups.get(key);
    if (entries) entries.push(expense);
    else groups.set(key, [expense]);
  }
  return [...groups].flatMap(([id, entries]) => {
    entries.sort((a, b) => b.paymentDate.localeCompare(a.paymentDate) || b.updatedAt.localeCompare(a.updatedAt) || b.id.localeCompare(a.id));
    const latest = entries[0];
    const current = entries.filter(e => e.paymentDate.slice(0, 7) === month);
    if (!latest.monthlyRecurring && !current.length) return [];
    const previous = entries.find(e => e.monthlyRecurring && e.useKind === "period" && e.paymentDate.slice(0, 7) === previousMonth);
    return [{ id, latest, current, previous }];
  }).sort((a, b) => a.latest.title.localeCompare(b.latest.title, "ko"));
}

// Only an editable input is produced. Opening the form never writes a transaction.
export function recurringDraft(source: Expense, month: string, id: () => string = () => crypto.randomUUID()): ExpenseInput {
  if (!validMonth(month) || shiftMonth(month, -1) !== source.paymentDate.slice(0, 7) || !source.monthlyRecurring || source.useKind !== "period") throw new Error("선택한 달의 지난달 반복 거래를 찾을 수 없어요.");
  const draft = expenseInputSchema.parse(structuredClone(source));
  return {
    ...draft, monthlyRecurring: true, recurringSeriesId: recurringSeries(source), recurringSourceId: source.id,
    paymentDate: moveDate(source.paymentDate, 1), time: null,
    useDate: moveDate(source.useDate, 1), useEnd: source.useEnd ? moveDate(source.useEnd, 1) : null,
    useTime: null, useTimeFollowsPayment: false, sortOrder: 0, orderReference: null, orderSide: "after",
    krwAmount: source.currency === "KRW" ? source.krwAmount : null, valuationRate: null, valuationSource: null,
    items: draft.items.map(item => ({ ...item, id: id(), discounts: item.discounts.map(discount => ({ ...discount, id: id() })) })),
    adjustments: draft.adjustments.map(adjustment => ({ ...adjustment, id: id() })),
    topup: draft.topup ? { ...draft.topup, date: moveDate(draft.topup.date, 1), time: null } : null,
  };
}
