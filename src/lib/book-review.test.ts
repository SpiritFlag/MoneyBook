import test from "node:test";
import assert from "node:assert/strict";
import { newExpense, type Expense } from "./expense";
import { newOperation, newRow, type Operation } from "./operations";
import { bookReview } from "./book-review";

const date = "2026-10-31";
const meta = { revision: 1, createdAt: date, updatedAt: date };
function expense(overrides: Partial<Expense> = {}): Expense {
  return { ...newExpense(date), ...meta, id: "sample", title: "가상 거래", paidAmount: "10000", ...overrides };
}
function operation(kind: Operation["kind"], overrides: Partial<Operation> = {}): Operation {
  return { ...newOperation(kind, date), ...meta, id: "operation", ...overrides };
}

test("review separates missing details from excess and never subtracts unlike currencies", () => {
  const missing = expense();
  assert.equal(bookReview([missing], [])[1].items.length, 0);
  const over = expense({ items: [{ id: "item", name: "상품", unitPrice: "12000", quantity: 1, discounts: [] }] });
  assert.equal(bookReview([over], [])[1].items[0].amount, 2000);
  assert.equal(bookReview([{ ...over, receiptCurrency: "USD", receiptTotal: null }], [])[1].items.length, 0);
});

test("review uses remaining shared amount and removes fully recovered or cancelled items", () => {
  const shared = expense({ shared: true, ownAmount: "6000" });
  const recovery = operation("recovery", { allocations: [{ targetId: shared.id, amount: "1500", itemId: "", deductible: "0" }] });
  assert.equal(bookReview([shared], [recovery])[2].items[0].amount, 2500);
  const recovered = { ...recovery, allocations: [{ targetId: shared.id, amount: "4000", itemId: "", deductible: "0" }] };
  assert.equal(bookReview([shared], [recovered])[2].items.length, 0);
  const cancelled = operation("cancel", { sourceId: shared.id });
  assert.equal(bookReview([shared], [cancelled]).flatMap(group => group.items).length, 0);
});

test("review flags only unconfirmed foreign card approvals and does not mutate the book", () => {
  const foreign = expense({ currency: "USD", receiptCurrency: "USD", paymentKind: "card", krwAmount: null, paidAmount: "12.50" });
  const input = [foreign];
  const before = structuredClone(input);
  assert.equal(bookReview(input, [])[0].items[0].amount, "12.50");
  assert.equal(bookReview([{ ...foreign, krwAmount: "17000" }], [])[0].items.length, 0);
  assert.equal(bookReview([{ ...foreign, paymentKind: "cash" }], [])[0].items.length, 0);
  assert.deepEqual(input, before);
});

test("review keeps toll agencies separate and subtracts only their linked withdrawals", () => {
  const toll = operation("toll", { id: "toll", rows: [
    { ...newRow(date, "a"), name: "기관 A", amount: "3000" },
    { ...newRow(date, "b"), name: "기관 B", amount: "5000" },
  ] });
  const payment = operation("toll-payment", { allocations: [{ targetId: "toll/a", amount: "3000", itemId: "", deductible: "0" }] });
  const items = bookReview([], [toll, payment])[3].items;
  assert.equal(items.length, 1);
  assert.equal(items[0].id, "toll/b");
  assert.equal(items[0].amount, 5000);
});
