import test from "node:test";
import assert from "node:assert/strict";
import { createBookRepository, type Book } from "./expense-repository";
import { newExpense, monthAmount, type Expense } from "./expense";
import { newAsset } from "./asset";
import { newOperation, operationSchema, netConsumption, consumptionRecords, statementRows, operationPostings, validateOperations, sharedRemaining, type OperationInput } from "./operations";

const date = "2026-10-10";
const metadata = { revision: 1, createdAt: date, updatedAt: date };
const expense: Expense = { ...newExpense(date), ...metadata, id: "purchase", title: "가상 구매", paymentMethod: "card", paidAmount: "100000" };
function setup(paid = false) {
  let saved: Book = {
    version: 1, gameCurrencies: [], cards: [], loans: [],
    expenses: [structuredClone(expense)],
    assets: [{ ...newAsset(date), ...metadata, id: "bank", name: "가상 계좌", kind: "account", currency: "KRW" }],
    operations: [operationSchema.parse({ ...newOperation("statement", "2026-11-20"), ...metadata, id: "bill", card: "card", month: "2026-11", start: "2026-10-01", end: "2026-10-31", selected: [expense.id], amount: "100000", verified: true, payment: paid ? { assetId: "bank", date: "2026-11-20", time: null, amount: "100000" } : null })],
  };
  const repository = createBookRepository({ read: async () => structuredClone(saved), transact: async action => action(structuredClone(saved), async book => { saved = structuredClone(book); }) });
  return { repository, read: () => structuredClone(saved) };
}
function cancel(patch: Partial<OperationInput> = {}): OperationInput {
  return { ...newOperation("cancel", "2026-11-21"), title: "가상 구매 취소", sourceId: expense.id, sourceRevision: 1, cancelScope: "partial", amount: "30000", ...patch };
}

test("출금 전 부분취소는 원래 소비와 검산된 미납 명세서만 줄이고 이후 납부할 수 있다", async () => {
  const { repository, read } = setup();
  await repository.saveOperation(cancel(), "partial", null);
  let book = read();
  assert.equal(book.expenses[0].paidAmount, "100000");
  assert.equal(netConsumption(book.expenses[0], book.operations), 70000);
  assert.equal(book.operations[0].amount, "70000");
  assert.equal(book.operations[0].revision, 2);
  assert.equal(statementRows(book.operations[0], book, "bill")[0].amount, 70000);
  assert.equal(monthAmount(consumptionRecords(book.expenses, book.operations)[0], "2026-10"), 70000);
  await repository.saveOperation({ ...book.operations[0], payment: { assetId: "bank", date: "2026-11-22", time: null, amount: "70000" } }, "bill", 2);
  book = read();
  validateOperations(book);
  assert.equal(operationPostings(book.operations, book.assets)[0].amount, -70000);
});

test("출금 전 전액취소는 지출과 기존 부분취소를 삭제하고 미납 명세서도 함께 정리한다", async () => {
  const { repository, read } = setup();
  await repository.saveOperation(cancel(), "partial", null);
  await repository.saveOperation(cancel({ cancelScope: "full", amount: "70000" }), "full", null);
  const book = read();
  assert.equal(book.expenses.length, 0);
  assert.equal(book.operations.length, 1);
  assert.deepEqual(book.operations[0].selected, []);
  assert.equal(book.operations[0].amount, "0");
  validateOperations(book);
});

for (const [scope, amount, net] of [["full", "100000", 0], ["partial", "30000", 70000]] as const) {
  test(`출금 후 ${scope} 취소는 과거 납부를 보존하고 다음 명세서에 음수 매출을 한 번 반영한다`, async () => {
    const { repository, read } = setup(true);
    await repository.saveOperation(cancel({ cancelRoute: "credit", cancelScope: scope, amount, month: "2026-12" }), "credit", null);
    let book = read();
    assert.equal(netConsumption(book.expenses[0], book.operations), net);
    assert.equal(book.operations[0].amount, "100000");
    assert.equal(book.operations[0].payment?.amount, "100000");
    const next = { ...newOperation("statement", "2026-12-20"), card: "card", month: "2026-12", start: "2026-11-01", end: "2026-11-30", selected: ["cancel:credit"], amount: `-${amount}`, verified: true };
    assert.equal(statementRows(next, book)[0].amount, -Number(amount));
    await repository.saveOperation(next, "next-bill", null);
    book = read();
    assert.equal(statementRows({ ...next, month: "2027-01" }, book).length, 0);
    assert.equal(operationPostings(book.operations, book.assets).length, 1);
    assert.equal(monthAmount(consumptionRecords(book.expenses, book.operations)[0], "2026-12"), undefined);
  });
}

test("부분취소 누적 뒤 잔액 전액취소와 중복·초과·0원·잘못된 반영월을 검증한다", async () => {
  const { repository, read } = setup(true);
  const credit = cancel({ cancelRoute: "credit", month: "2026-12" });
  await repository.saveOperation(credit, "first", null);
  await repository.saveOperation(credit, "first", null);
  assert.equal(read().operations.length, 2);
  for (const patch of [{ amount: "80000" }, { amount: "0" }, { month: "2026-11" }, { date: "2026-11-19" }, { date: "2027-01-01" }, { sourceRevision: 2 }, { cancelRoute: "exclude" as const }]) {
    await assert.rejects(repository.saveOperation({ ...credit, ...patch }, "invalid", null));
    assert.equal(read().operations.length, 2);
  }
  await repository.saveOperation({ ...credit, amount: "20000" }, "second", null);
  await repository.saveOperation({ ...credit, cancelScope: "full", amount: "50000" }, "last", null);
  const book = read();
  validateOperations(book);
  assert.equal(netConsumption(book.expenses[0], book.operations), 0);
  assert.equal(statementRows({ ...newOperation("statement", "2026-12-20"), card: "card", month: "2026-12" }, book).reduce((sum, row) => sum + (row.amount ?? 0), 0), -100000);
  await assert.rejects(repository.saveOperation(credit, "duplicate", null));
});

test("출금 전 일부 취소→납부→나머지 취소는 실제 납부 잔액만 다음 명세서에 반영한다", async () => {
  const { repository, read } = setup();
  await repository.saveOperation(cancel({ date: "2026-11-19" }), "before", null);
  const bill = read().operations[0];
  await repository.saveOperation({ ...bill, payment: { assetId: "bank", date: "2026-11-20", time: null, amount: "70000" } }, "bill", bill.revision);
  await repository.saveOperation(cancel({ cancelScope: "full", amount: "70000", cancelRoute: "credit", month: "2026-12" }), "after", null);
  const book = read();
  validateOperations(book);
  assert.equal(netConsumption(book.expenses[0], book.operations), 0);
  assert.equal(statementRows({ ...newOperation("statement", "2026-12-20"), card: "card", month: "2026-12" }, book)[0].amount, -70000);
});

test("공동부담 부분취소는 본인 소비와 분담금 잔액의 기존 비율을 유지한다", () => {
  const shared = { ...expense, shared: true, ownAmount: "40000" };
  const operation = operationSchema.parse({ ...cancel(), ...metadata, id: "partial" });
  assert.equal(netConsumption(shared, [operation]), 28000);
  assert.equal(sharedRemaining(shared, [operation]), 42000);
});

test("원화 미확정 해외승인도 출금 전 전액취소로 삭제할 수 있다", async () => {
  let saved: Book = { version: 1, cards: [], loans: [], gameCurrencies: [], assets: [], operations: [], expenses: [{ ...expense, currency: "USD", paidAmount: "10.50", krwAmount: null }] };
  const repository = createBookRepository({ read: async () => structuredClone(saved), transact: async action => action(structuredClone(saved), async book => { saved = structuredClone(book); }) });
  await repository.saveOperation(cancel({ cancelScope: "full", amount: "0" }), "delete", null);
  assert.equal(saved.expenses.length, 0);
  assert.equal(saved.operations.length, 0);
});
