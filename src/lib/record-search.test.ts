import assert from "node:assert/strict";
import test from "node:test";
import { newExpense, type Expense } from "./expense";
import { newOperation, type BookData, type Operation } from "./operations";
import { searchBookRecords, type RecordSearchQuery } from "./record-search";

const expense: Expense = { ...newExpense("2026-11-01"), id: "receipt", revision: 1, createdAt: "", updatedAt: "",
  title: "장보기", paidAmount: "12.50", currency: "USD", memo: "지난번 쿠폰 사용", paymentMethod: "해외 카드",
  useDate: "2026-10-31", items: [{ id: "item", name: "우유", quantity: 2, unitPrice: "3", discounts: [] }] };
const operation: Operation = { ...newOperation("statement", "2026-10-20"), id: "statement", revision: 1, createdAt: "", updatedAt: "",
  title: "카드 청구", payment: { assetId: "bank", date: "2026-11-05", time: null, amount: "50000" } };
const book: BookData = { assets: [], expenses: [expense], operations: [operation] };
const query: RecordSearchQuery = { query: "", start: "", end: "", collection: "all" };

test("상품·메모·결제수단의 여러 단어로 원본을 찾고 외화 입력액과 상세 경로를 보존한다", () => {
  const rows = searchBookRecords(book, { ...query, query: "우유   쿠폰 해외" });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].amount, "12.50");
  assert.equal(rows[0].currency, "USD");
  assert.equal(rows[0].href, "/transactions/receipt");
  assert.deepEqual(searchBookRecords(book, { ...query, query: "우유 없는단어" }), []);
  assert.equal(expense.krwAmount, null);
});

test("지출은 결제일로, 금융 기록은 중첩 납부일로 찾으며 범위 끝을 포함한다", () => {
  assert.deepEqual(searchBookRecords(book, { ...query, start: "2026-10-31", end: "2026-10-31", collection: "expenses" }), []);
  assert.equal(searchBookRecords(book, { ...query, start: "2026-11-01", end: "2026-11-01" })[0].id, "expense:receipt");
  const rows = searchBookRecords(book, { ...query, start: "2026-11-05", end: "2026-11-05" });
  assert.deepEqual(rows.map(row => row.href), ["/records/statement"]);
});

test("빈 검색은 모든 저장 원본을 날짜 역순으로, 종류 필터는 해당 원본만 반환한다", () => {
  assert.deepEqual(searchBookRecords(book, query).map(row => row.id), ["expense:receipt", "operation:statement"]);
  assert.equal(searchBookRecords(book, { ...query, collection: "operations" }).length, 1);
  assert.deepEqual(searchBookRecords({ ...book, expenses: [], operations: [] }, query), []);
});
