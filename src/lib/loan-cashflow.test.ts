import test from "node:test";
import assert from "node:assert/strict";
import { newExpense, ownMinor, consumptionMinor, consumptionKrw, categoryAmounts, receiptCategoryAmounts, daySummary, monthAmount, type ExpenseInput } from "./expense";
import { newAsset, assetPosition, assetLedger } from "./asset";
import { createBookRepository, storedSchema, type Book } from "./expense-repository";
import { newOperation, consumptionRecords, netConsumption, operationPostings, incomeMinor, sharedRemaining, statementRows } from "./operations";
import { dailyBook, dailyQuerySchema, monthlyBook, monthlyQuerySchema, getRecord, recordQuerySchema } from "./mcp-queries";
import { buddyProjection } from "./buddy-review";

const date = "2026-10-25";
const metadata = { revision: 1, createdAt: date, updatedAt: date };
function repayment(): ExpenseInput {
  return { ...newExpense(date), title: "가상 대출 상환", category: "mixed", paidAmount: "350000", paymentKind: "account", paymentMethod: "가상 계좌", assetId: "bank", items: [
    { id: "principal", name: "원금", category: "loan", unitPrice: "300000", quantity: 1, discounts: [] },
    { id: "interest", name: "이자", category: "other", unitPrice: "50000", quantity: 1, discounts: [] },
  ] };
}

test("대출 입금·혼합 상환을 저장·수정·재조회하고 원장 전체액과 소비를 분리한다", async () => {
  let book: Book = storedSchema.parse({ version: 1, expenses: [] });
  const repo = createBookRepository({ read: async () => structuredClone(book), transact: async fn => fn(structuredClone(book), async next => { book = structuredClone(next); }) });
  await repo.saveAsset({ ...newAsset(date), name: "가상 계좌", openingBalance: "0" }, "bank", null);
  await repo.saveOperation({ ...newOperation("income", date), title: "가상 대출 실행", incomeCategory: "loan", amount: "10000000", assetId: "bank" }, "drawdown", null);
  await repo.save(repayment(), "repay", null);
  let expense = (await repo.list())[0];
  assert.equal(netConsumption(expense, book.operations), 50000);
  assert.equal(ownMinor(expense), 350000);
  assert.deepEqual(categoryAmounts(expense), [{ category: "other", amount: 50000 }]);
  assert.equal(receiptCategoryAmounts(expense).find(row => row.category === "loan")?.amount, 300000);
  const postings = operationPostings(book.operations, book.assets);
  assert.equal(incomeMinor(book.operations[0]), 0);
  assert.equal(incomeMinor({ ...book.operations[0], incomeCategory: "employment" }), 10000000);
  assert.equal(assetPosition(book.assets[0], book.expenses, date, postings).balance, 9650000);
  assert.deepEqual(assetLedger(book.assets[0], book.expenses, postings).map(row => row.amount).sort((a, b) => a - b), [-350000, 10000000]);
  const daily = dailyBook(book, dailyQuerySchema.parse({ date }));
  assert.equal(daily.consumptionKrw.total, 50000);
  const deposit = daily.items.find(row => row.income);
  assert.ok(deposit?.income);
  assert.equal(deposit.incomeAmountMinor, 0);
  const monthly = monthlyBook(book, monthlyQuerySchema.parse({ month: "2026-10" }));
  assert.equal(monthly.totalKrw, 50000);
  assert.deepEqual(monthly.categoryTotalsKrw, { other: 50000 });
  assert.equal(buddyProjection(book, "2026-10", null, `${date}T12:00:00Z`).totalKrw, 50000);
  const detail = getRecord(book, recordQuerySchema.parse({ collection: "operations", id: "drawdown" }));
  assert.ok("incomeAmountMinor" in detail);
  assert.equal(detail.incomeAmountMinor, 0);
  assert.equal(book.expenses[0].items.length, 2, "집계가 저장 명세를 변경하지 않는다");
  await repo.save({ ...expense, category: "loan" }, expense.id, expense.revision);
  expense = (await repo.list())[0];
  assert.equal(netConsumption(expense, book.operations), 0);
  assert.equal(monthlyBook(book, monthlyQuerySchema.parse({ month: "2026-10" })).totalKrw, 0);
  await repo.save({ ...expense, category: "mixed" }, expense.id, expense.revision);
  assert.equal(netConsumption((await repo.list())[0], book.operations), 50000);
});

test("혼합 대출은 할인·공동부담·외화·연간 배분과 취소에서도 원금을 한 번만 제외한다", () => {
  const shared = { ...repayment(), shared: true, ownAmount: "175000" };
  const expense = { ...shared, id: "shared", ...metadata };
  assert.equal(consumptionMinor(shared), 25000);
  assert.equal(sharedRemaining(expense, []), 175000, "분담금은 원금 제외 전 실제 본인 부담 기준");
  const discounted = { ...repayment(), paidAmount: "315000", adjustments: [{ id: "discount", name: "가상 할인", kind: "discount" as const, amount: "35000" }] };
  assert.equal(consumptionKrw(discounted), 45000);
  const foreign = { ...repayment(), currency: "USD" as const, receiptCurrency: "KRW" as const, receiptTotal: "350000", paidAmount: "250.00", krwAmount: "350001" };
  assert.equal(consumptionMinor(foreign), 3571);
  assert.equal(consumptionKrw(foreign), 50000);
  assert.equal(consumptionKrw({ ...foreign, krwAmount: null }), null);
  const period = { ...repayment(), useKind: "period" as const, allocation: "annual" as const, useEnd: "2027-10-24", id: "period", ...metadata };
  const derived = consumptionRecords([period], [])[0];
  const months = Array.from({ length: 12 }, (_, i) => new Date(Date.UTC(2026, 9 + i, 1)).toISOString().slice(0, 7));
  assert.equal(months.reduce((sum, month) => sum + (monthAmount(derived, month) ?? 0), 0), 50000);
  assert.equal(daySummary([derived], date).total, 0);
  const cancel = { ...newOperation("cancel", date), sourceId: expense.id, id: "cancel", ...metadata };
  const cancelled = consumptionRecords([expense], [cancel])[0];
  assert.equal(consumptionKrw(cancelled), 0);
  assert.ok(categoryAmounts(cancelled).every(row => row.amount === 0));
  const cardExpense = { ...expense, paymentKind: "card" as const, paymentMethod: "가상 카드", assetId: null };
  assert.equal(statementRows({ ...newOperation("statement", date), card: "가상 카드", start: date, end: date }, { expenses: [cardExpense], assets: [], operations: [] })[0].amount, 350000);
});

test("대출만 있는 외화·혼합 거래는 원화 미확정 소비로 세지 않는다", () => {
  const pure = { ...repayment(), category: "loan" as const, currency: "USD" as const, paidAmount: "250.00", krwAmount: null };
  assert.equal(consumptionKrw(pure), 0);
  assert.deepEqual(categoryAmounts(pure), []);
  const allPrincipal = { ...pure, category: "mixed" as const, items: repayment().items.map(item => ({ ...item, category: "loan" as const })) };
  assert.equal(consumptionKrw(allPrincipal), 0);
  const expense = { ...allPrincipal, id: "principal", ...metadata };
  assert.deepEqual(daySummary(consumptionRecords([expense], []), date), { total: 0, pending: 0 });
  assert.equal(monthAmount(expense, "2026-10"), 0);
  assert.deepEqual(categoryAmounts(expense), []);
});
