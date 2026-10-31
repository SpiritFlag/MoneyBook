import test from "node:test";
import assert from "node:assert/strict";
import { createBookRepository, storedSchema, type Book } from "./expense-repository";
import { newExpense, expenseInputSchema, type Expense } from "./expense";
import { newAsset } from "./asset";
import { assetLedger } from "./asset";
import { newOperation, operationSchema, newRow, operationPostings, consumptionRecords, validateOperations } from "./operations";
import { retainedTrash, trashExpiresAt, TRASH_RETENTION_MS } from "./trash";

const date = "2026-10-20";
const meta = { revision: 1, createdAt: "2026-10-20T00:00:00.000Z", updatedAt: "2026-10-20T00:00:00.000Z" };
const expense: Expense = { ...newExpense(date), ...meta, id: "expense", title: "가상 지출", paymentKind: "cash", assetId: "cash", paymentMethod: "현금", paidAmount: "100" };
function setup(patch: Partial<Book> = {}) {
  let saved = storedSchema.parse({ version: 1, expenses: [expense], assets: [{ ...newAsset(date), ...meta, id: "cash", name: "현금", kind: "cash" }], ...patch });
  const repository = createBookRepository({
    read: async () => structuredClone(saved),
    transact: async action => action(structuredClone(saved), async book => { saved = storedSchema.parse(structuredClone(book)); }),
  });
  return { repository, read: () => structuredClone(saved) };
}

test("휴지통 이동은 소비와 원장에서 제외하고 원본·명세를 보존해 복원한다", async () => {
  const { repository, read } = setup();
  assert.equal(assetLedger(read().assets[0], read().expenses).length, 1);
  const entry = await repository.moveToTrash("expense", expense.id, 1);
  assert.equal((await repository.list()).length, 0);
  assert.equal(consumptionRecords(read().expenses, read().operations).length, 0);
  assert.equal(assetLedger(read().assets[0], read().expenses).length, 0);
  assert.equal(operationPostings(read().operations, read().assets).length, 0);
  assert.deepEqual(entry.expenses[0], expense);
  assert.equal((await repository.listTrash()).length, 1);
  await assert.rejects(repository.save(expenseInputSchema.parse(expense), expense.id, null), { status: 409 });
  await repository.restoreTrash(entry.id);
  assert.equal((await repository.listTrash()).length, 0);
  const restored = (await repository.list())[0];
  assert.deepEqual(expenseInputSchema.parse(restored), expenseInputSchema.parse(expense));
  assert.equal(restored.revision, 2);
  assert.equal(assetLedger(read().assets[0], read().expenses).length, 1);
  await assert.rejects(repository.save(expenseInputSchema.parse(expense), expense.id, 1), { status: 409 });
});

test("지출과 연결 충전은 함께 삭제·복원하고 독립 삭제와 오래된 삭제를 거절한다", async () => {
  const operation = operationSchema.parse({ ...newOperation("transfer", date), ...meta, id: "topup", title: "연결 충전", parentId: expense.id, rows: [{ ...newRow(date, "topup"), fromId: "bank", toId: "cash", amount: "1000", received: "1000" }] });
  const { repository, read } = setup({ operations: [operation], assets: [{ ...newAsset(date), ...meta, id: "cash", name: "현금", kind: "cash" }, { ...newAsset(date), ...meta, id: "bank", name: "계좌", kind: "account" }] });
  await assert.rejects(repository.moveToTrash("expense", expense.id, 2), { status: 409 });
  await assert.rejects(repository.moveToTrash("operation", operation.id, 1), { status: 400 });
  const entry = await repository.moveToTrash("expense", expense.id, 1);
  assert.equal(read().operations.length, 0);
  assert.equal(entry.operations.length, 1);
  await repository.restoreTrash(entry.id);
  assert.equal(read().operations[0].parentId, expense.id);
  assert.equal(read().operations[0].revision, 2);
  validateOperations(read());
});

test("수입 거래도 휴지통에 보관하며 다른 저장소에 노출하거나 복원하지 않는다", async () => {
  const income = operationSchema.parse({ ...newOperation("income", date), ...meta, id: "income", title: "가상 수입", assetId: "cash", amount: "300" });
  const { repository, read } = setup({ operations: [income] });
  const entry = await repository.moveToTrash("operation", income.id, 1);
  assert.equal(read().operations.length, 0);
  await assert.rejects(repository.saveOperation(income, income.id, null), { status: 409 });
  const other = setup({ expenses: [] }).repository;
  assert.deepEqual(await other.listTrash(), []);
  await assert.rejects(other.restoreTrash(entry.id), { status: 404 });
  await repository.restoreTrash(entry.id);
  assert.equal(operationPostings(read().operations, read().assets)[0].amount, 300);
});

test("보험금·명세서·취소전표 연결을 둔 거래는 삭제하지 않고 원자적으로 보존한다", async () => {
  for (const operation of [
    { ...newOperation("insurance", date), allocations: [{ targetId: expense.id, itemId: "", amount: "10", deductible: "0" }] },
    { ...newOperation("statement", date), selected: [expense.id] },
    { ...newOperation("statement", date), deferred: [expense.id] },
    { ...newOperation("cancel", date), sourceId: expense.id },
  ]) {
    const op = operationSchema.parse({ ...operation, ...meta, id: "linked", title: "연결 기록" });
    const { repository, read } = setup({ operations: [op] });
    const before = read();
    await assert.rejects(repository.moveToTrash("expense", expense.id, 1), { status: 400 });
    assert.deepEqual(read(), before);
  }
  const cancellation = operationSchema.parse({ ...newOperation("cancel", date), ...meta, id: "cancel", title: "취소" });
  const statement = operationSchema.parse({ ...newOperation("statement", date), ...meta, id: "statement", title: "명세서", selected: ["cancel:cancel"] });
  const { repository } = setup({ operations: [cancellation, statement] });
  await assert.rejects(repository.moveToTrash("operation", "cancel", 1), { status: 400 });
});

test("복원 시 연결 유효성을 다시 검증하고 실패하면 휴지통을 보존한다", async () => {
  const income = operationSchema.parse({ ...newOperation("income", date), ...meta, id: "income", title: "가상 수입", assetId: "missing", amount: "100" });
  const entry = { id: "trash", deletedAt: new Date().toISOString(), expenses: [], operations: [income] };
  const { repository, read } = setup({ trash: [entry] });
  await assert.rejects(repository.restoreTrash(entry.id), { status: 400 });
  assert.deepEqual(read().trash, [entry]);
  assert.equal(read().operations.length, 0);
});

test("삭제 후 정확히 30일이 되면 복원할 수 없고 조회 시 저장본에서도 만료 항목만 제거한다", async () => {
  const now = Date.now();
  const entry = { id: "expired", deletedAt: new Date(now - TRASH_RETENTION_MS).toISOString(), expenses: [expense], operations: [] };
  assert.equal(trashExpiresAt(entry).getTime(), now);
  assert.equal(retainedTrash([entry], now - 1).length, 1);
  assert.equal(retainedTrash([entry], now).length, 0);
  const fresh = { ...entry, id: "fresh", deletedAt: new Date(now).toISOString() };
  const { repository, read } = setup({ expenses: [], trash: [entry, fresh] });
  assert.deepEqual((await repository.listTrash()).map(t => t.id), ["fresh"]);
  assert.deepEqual(read().trash?.map(t => t.id), ["fresh"]);
  await assert.rejects(repository.restoreTrash(entry.id), { status: 404 });
});

test("휴지통 필드가 없는 기존 장부와 삭제 대상 없음도 처리한다", async () => {
  const { repository } = setup();
  assert.deepEqual(await repository.listTrash(), []);
  await assert.rejects(repository.moveToTrash("expense", "unknown", 1), { status: 404 });
});
