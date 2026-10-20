import { bookDate, bookTimeOrder, parseDateQuery } from "./date";
import { dailyExpenses, dayTime, orderAroundReferences, type Expense, type ExpenseInput } from "./expense";
import { operationExpenses, type Operation, type OperationRow, type BookData } from "./operations";
export type DailyRecord = { id: string; expense: Expense; income?: never; transfer?: never } | { id: string; income: Operation; expense?: never; transfer?: never } | { id: string; transfer: { operation: Operation; row: OperationRow; index: number }; expense?: never; income?: never };
export function dailyIncomes(operations: readonly Operation[], date: string) {
  return operations.filter(o => o.kind === "income" && bookDate(o.date, o.time) === date);
}
export function dailyRecords(expenses: readonly Expense[], operations: readonly Operation[], date: string): DailyRecord[] {
  const transfers: DailyRecord[] = operations.filter(o => o.kind === "transfer").flatMap(operation => operation.rows.flatMap((row, index) => bookDate(row.date, row.time) === date ? [{ id: `transfer:${operation.id}/${row.id}`, transfer: { operation, row, index } }] : []));
  const rows: DailyRecord[] = [...expenses.map(expense => ({ id: expense.id, expense })), ...dailyIncomes(operations, date).map(income => ({ id: income.id, income })), ...transfers];
  const time = (r: DailyRecord) => r.transfer ? r.transfer.row.time : r.income ? r.income.time : dayTime(r.expense, date);
  const createdAt = (r: DailyRecord) => r.transfer ? r.transfer.operation.createdAt : r.income ? r.income.createdAt : r.expense.createdAt;
  const rank = (r: DailyRecord) => r.transfer ? r.transfer.operation.parentId ? -1 : r.transfer.index : r.expense?.sortOrder ?? 0;
  rows.sort((a,b) => bookTimeOrder(time(a)) - bookTimeOrder(time(b)) || rank(a) - rank(b) || createdAt(a).localeCompare(createdAt(b)) || a.id.localeCompare(b.id));
  return orderAroundReferences(rows, r => r.expense && time(r) === null ? r.expense.orderReference : null, r => r.expense?.orderSide ?? "after");
}
export function dailyOrderReferences(book: BookData, value: ExpenseInput, id?: string) {
  if (value.useKind !== "once" || value.useTime !== null || parseDateQuery(value.useDate) === null) return [];
  const date = bookDate(value.useDate, value.useTime);
  const expenses = dailyExpenses([...book.expenses, ...operationExpenses(book.operations)], date);
  return dailyRecords(expenses, book.operations, date).filter(row => row.id !== id).map(row => ({
    id: row.id,
    title: row.transfer ? `자산 이동 · ${row.transfer.operation.title} · ${row.transfer.row.name || `이동 ${row.transfer.index + 1}`}` : row.income ? `수입 · ${row.income.title}` : `${row.expense.id.startsWith("operation:") ? row.expense.category === "transport" ? "교통 · " : "금융 · " : row.expense.useKind === "period" ? "기간형 결제 · " : ""}${row.expense.title}`,
    time: row.transfer ? row.transfer.row.time : row.income ? row.income.time : dayTime(row.expense, date),
  }));
}
