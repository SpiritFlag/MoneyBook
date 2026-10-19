import { bookDate, bookTimeOrder } from "./date";
import { dayTime, orderAroundReferences, type Expense } from "./expense";
import { type Operation } from "./operations";
export type DailyRecord = { id: string; expense: Expense; income?: never } | { id: string; income: Operation; expense?: never };
export function dailyIncomes(operations: readonly Operation[], date: string) {
  return operations.filter(o => o.kind === "income" && bookDate(o.date, o.time) === date);
}
export function dailyRecords(expenses: readonly Expense[], operations: readonly Operation[], date: string): DailyRecord[] {
  const rows: DailyRecord[] = [...expenses.map(expense => ({ id: expense.id, expense })), ...dailyIncomes(operations, date).map(income => ({ id: income.id, income }))];
  const time = (r: DailyRecord) => r.income ? r.income.time : dayTime(r.expense, date);
  rows.sort((a,b) => bookTimeOrder(time(a)) - bookTimeOrder(time(b)) || (a.expense?.sortOrder ?? 0) - (b.expense?.sortOrder ?? 0) || (a.income ?? a.expense).createdAt.localeCompare((b.income ?? b.expense).createdAt) || a.id.localeCompare(b.id));
  return orderAroundReferences(rows, r => r.expense && time(r) === null ? r.expense.orderReference : null, r => r.expense?.orderSide ?? "after");
}
