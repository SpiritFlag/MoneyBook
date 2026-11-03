import test from "node:test";
import assert from "node:assert/strict";
import { daySummary, monthAmount, newExpense } from "./expense";
import { storedSchema } from "./expense-repository";
import { monthlyBook, monthlyQuerySchema } from "./mcp-queries";

test("a ski pass allocates across the calendar year without adding daily consumption", () => {
  const date = "2026-11-20";
  const book = storedSchema.parse({ version: 1, expenses: [{
    ...newExpense(date), id: "ski", revision: 1, createdAt: date, updatedAt: date,
    title: "Ski pass", paymentMethod: "Card", paidAmount: "300002",
    useKind: "period", useDate: "2026-12-15", useEnd: "2027-02-15", allocation: "period-months",
  }] });
  const [expense] = book.expenses;
  const months = ["2026-11", "2026-12", "2027-01", "2027-02", "2027-03"];
  assert.deepEqual(months.map(month => monthlyBook(book, monthlyQuerySchema.parse({ month })).totalKrw), [0, 100002, 100000, 100000, 0]);
  assert.equal(daySummary([expense], expense.useDate).total, 0);
  assert.equal(monthAmount({ ...expense, useEnd: "2026-12-31" }, "2026-12"), 300002);
  assert.deepEqual(months.map(month => monthAmount({ ...expense, currency: "USD", krwAmount: null }, month)), [undefined, null, null, null, undefined]);
});
