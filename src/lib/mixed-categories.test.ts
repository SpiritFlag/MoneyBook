import test from "node:test";
import assert from "node:assert/strict";
import { newExpense, expenseInputSchema, categoryAmounts, categorySubtotals, dominantCategory, ownKrw, monthAmount, type ExpenseInput, type Expense } from "./expense";
import { createBookRepository, storedSchema, type Book } from "./expense-repository";
import { consumptionRecords, newOperation, operationSchema } from "./operations";

const date = "2026-10-20";
function mixed(): ExpenseInput {
  return { ...newExpense(date), title: "GS25", paymentMethod: "현금", paymentKind: "cash", category: "mixed", paidAmount: "15230", items: [
    { id: "a", name: "상품 A", category: "hobby", unitPrice: "10000", quantity: 1, discounts: [] },
    { id: "b", name: "상품 B", category: "food", unitPrice: "4900", quantity: 1, discounts: [] },
    { id: "c", name: "상품 C", category: "goods", unitPrice: "330", quantity: 1, discounts: [] },
  ] };
}

test("혼합 지출은 상품별 카테고리를 보존하고 일반 지출의 이전 명세도 그대로 읽는다", async () => {
  let book: Book = storedSchema.parse({ version: 1, expenses: [] });
  const repo = createBookRepository({ read: async () => structuredClone(book), transact: async fn => fn(structuredClone(book), async next => { book = structuredClone(next); }) });
  const input = mixed();
  await repo.save(input, "mixed", null);
  const saved = (await repo.list())[0];
  assert.deepEqual(saved.items, input.items);
  assert.equal(dominantCategory(saved), "hobby");
  assert.deepEqual(categoryAmounts(saved), [{ category: "food", amount: 4900 }, { category: "goods", amount: 330 }, { category: "hobby", amount: 10000 }]);
  await repo.save({ ...saved, items: [...saved.items].reverse() }, saved.id, saved.revision);
  const reordered = (await repo.list())[0];
  assert.deepEqual(categoryAmounts(reordered), categoryAmounts(saved));
  assert.equal(dominantCategory(reordered), "hobby");
  const legacy = { ...input, category: "food" as const, items: input.items.map(item => { const legacyItem = { ...item }; delete legacyItem.category; return legacyItem; }) };
  assert.equal(expenseInputSchema.safeParse(legacy).success, true);
  assert.deepEqual(categoryAmounts(legacy), [{ category: "food", amount: 15230 }]);
  await repo.save({ ...reordered, category: "goods" }, reordered.id, reordered.revision);
  assert.deepEqual(categoryAmounts((await repo.list())[0]), [{ category: "goods", amount: 15230 }]);
});

test("혼합 아이콘은 상품 할인·수량을 반영한 카테고리 소계로 정하고 동률은 상품 순서와 무관하다", () => {
  const value = { ...mixed(), items: [
    { id: "a", name: "생활", category: "goods" as const, unitPrice: "1000", quantity: 2, discounts: [{ id: "coupon", name: "상품 할인", amount: "1500" }] },
    { id: "b", name: "식품1", category: "food" as const, unitPrice: "300", quantity: 1, discounts: [] },
    { id: "c", name: "식품2", category: "food" as const, unitPrice: "300", quantity: 1, discounts: [] },
  ] };
  assert.deepEqual(categorySubtotals(value), [{ category: "food", amount: 600 }, { category: "goods", amount: 500 }]);
  assert.equal(dominantCategory(value), "food");
  value.items[0].discounts[0].amount = "1400";
  assert.equal(dominantCategory(value), "food");
  assert.equal(dominantCategory({ ...value, items: [...value.items].reverse() }), "food");
});

test("전체 할인·가산과 내 몫·원화 환산·월 배분 후에도 카테고리 통계 합계가 정확하다", () => {
  const value = { ...mixed(), paidAmount: "14460", shared: true, ownAmount: "7231", adjustments: [
    { id: "d", kind: "discount" as const, name: "전체 할인", amount: "1000" },
    { id: "s", kind: "surcharge" as const, name: "배송비", amount: "230" },
  ] };
  assert.equal(expenseInputSchema.safeParse(value).success, true);
  const shares = categoryAmounts(value);
  assert.equal(shares.reduce((sum, row) => sum + row.amount!, 0), 7231);
  for (const row of shares) {
    const weight = categorySubtotals(value).find(w => w.category === row.category)!.amount;
    assert.ok(Math.abs(row.amount! - 7231 * weight / 15230) < 1);
  }
  const foreign: ExpenseInput = { ...mixed(), currency: "USD", receiptCurrency: "USD", paidAmount: "10.00", krwAmount: "13999", items: [
    { id: "a", name: "생활", category: "goods", unitPrice: "6.00", quantity: 1, discounts: [] },
    { id: "b", name: "식품", category: "food", unitPrice: "4.00", quantity: 1, discounts: [] },
  ] };
  assert.equal(expenseInputSchema.safeParse(foreign).success, true);
  assert.deepEqual(categoryAmounts(foreign), [{ category: "food", amount: 5600 }, { category: "goods", amount: 8399 }]);
  assert.deepEqual(categoryAmounts({ ...foreign, krwAmount: null }), [{ category: "food", amount: null }, { category: "goods", amount: null }]);
  const period: ExpenseInput = { ...value, useKind: "period", useEnd: "2027-10-19", allocation: "annual" };
  for (const month of ["2026-10", "2026-11", "2027-01", "2027-09"]) {
    const total = monthAmount(period, month)!;
    assert.equal(categoryAmounts(period, total).reduce((sum, row) => sum + row.amount!, 0), total);
  }
  const expense: Expense = { ...foreign, id: "foreign", revision: 1, createdAt: date, updatedAt: date };
  const cancellation = operationSchema.parse({ ...newOperation("cancel", date), sourceId: expense.id, id: "cancel", revision: 1, createdAt: date, updatedAt: date });
  const cancelled = consumptionRecords([expense], [cancellation])[0];
  assert.equal(ownKrw(cancelled), 0);
  assert.ok(categoryAmounts(cancelled).every(row => row.amount === 0));
});

test("정확히 분류할 수 없는 혼합 명세는 저장 전에 설명하고 거절한다", () => {
  const value = mixed();
  assert.equal(expenseInputSchema.safeParse(value).success, true);
  for (const invalid of [
    { ...value, items: [] },
    { ...value, items: value.items.map(item => ({ ...item, category: undefined })) },
    { ...value, items: [{ ...value.items[0], category: "mixed" }] },
    { ...value, paidAmount: "15231" },
    { ...value, currency: "USD", paidAmount: "10", receiptTotal: null },
    { ...value, paidAmount: "1", items: [{ ...value.items[0], unitPrice: "0" }], adjustments: [{ id: "s", name: "가산", kind: "surcharge", amount: "1" }] },
  ]) assert.equal(expenseInputSchema.safeParse(invalid).success, false);
  const zero = { ...value, paidAmount: "0", items: [{ ...value.items[0], unitPrice: "0" }] };
  assert.equal(expenseInputSchema.safeParse(zero).success, true);
  assert.deepEqual(categoryAmounts(zero), [{ category: "hobby", amount: 0 }]);
});
