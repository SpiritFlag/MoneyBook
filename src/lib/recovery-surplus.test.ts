import test from "node:test";
import assert from "node:assert/strict";
import { createBookRepository, storedSchema, type Book } from "./expense-repository";
import { newExpense } from "./expense";
import { newAsset } from "./asset";
import { newOperation, operationInputSchema, operationPostings, incomeMinor, incomeOperations, sharedRemaining, netConsumption } from "./operations";
import { dailyRecords } from "./daily-records";
import { inspectAssets, assetsSchema } from "./mcp-exploration";

const date = "2026-11-08";
const metadata = { revision: 1, createdAt: date, updatedAt: date };
function setup() {
  let saved = storedSchema.parse({ version: 1, assets: [{ ...newAsset(date), ...metadata, id: "cash", name: "현금", kind: "cash", openingBalance: "0" }],
    expenses: [{ ...newExpense(date), ...metadata, id: "cafe", title: "가상 카페", paymentKind: "card", paymentMethod: "가상 카드", paidAmount: "3500", shared: true, ownAmount: "0" }] });
  const repository = createBookRepository({ read: async () => structuredClone(saved), transact: async action => action(structuredClone(saved), async book => { saved = storedSchema.parse(JSON.parse(JSON.stringify(book))); }) });
  return { repository, read: (): Book => structuredClone(saved) };
}
const input = { ...newOperation("recovery", date), title: "카페 분담금 회수", assetId: "cash", time: "11:00", amount: "4000", recoverySurplusAsIncome: true,
  allocations: [{ targetId: "cafe", itemId: "", amount: "3500", deductible: "0" }] };

test("분담금 3500원과 잔돈 수입 500원을 원자 저장하고 입금·수입·소비를 중복하지 않는다", async () => {
  const { repository, read } = setup();
  await repository.saveOperation(input, "recovery", null);
  await repository.saveOperation(input, "recovery", null);
  const book = read();
  assert.equal(book.operations.length, 1);
  assert.equal(operationPostings(book.operations, book.assets).length, 1);
  assert.equal(operationPostings(book.operations, book.assets)[0].amount, 4000);
  assert.equal(sharedRemaining(book.expenses[0], book.operations), 0);
  assert.equal(netConsumption(book.expenses[0], book.operations), 0);
  assert.equal(incomeMinor(book.operations[0]), 500);
  const income = incomeOperations(book.operations);
  assert.equal(income.length, 1);
  assert.equal(income[0].amount, "500");
  assert.equal(income[0].id, "recovery");
  assert.equal(income[0].incomeCategory, "other");
  const daily = dailyRecords([], book.operations, date)[0];
  assert.ok("incomeAmountMinor" in daily);
  assert.equal(daily.incomeAmountMinor, 500);
  const inspected = inspectAssets(book, assetsSchema.parse({ start: date, end: date }), new Date("2026-11-08T12:00:00+09:00"));
  assert.ok(JSON.stringify(inspected).includes('"incomeByCurrencyMinor":{"KRW":500}'));
});

test("초과 수령을 명시하지 않거나 귀속액이 수령액·분담금을 초과하면 저장하지 않는다", async () => {
  const { repository, read } = setup();
  await assert.rejects(repository.saveOperation({ ...input, recoverySurplusAsIncome: undefined }, "no-choice", null), /일치/);
  await assert.rejects(repository.saveOperation({ ...input, amount: "3000" }, "short", null), /초과/);
  await assert.rejects(repository.saveOperation({ ...input, allocations: [{ ...input.allocations[0], amount: "3600" }] }, "over", null), /초과/);
  await assert.rejects(repository.saveOperation({ ...newOperation("income", date), assetId: "cash", amount: "500", recoverySurplusAsIncome: true }, "wrong-kind", null), /분담금 회수/);
  assert.equal(read().operations.length, 0);
  await repository.saveOperation({ ...input, amount: "3500", recoverySurplusAsIncome: undefined }, "legacy", null);
  assert.equal(incomeMinor(read().operations[0]), 0);
  assert.deepEqual(incomeOperations(read().operations), []);
});

test("수정·휴지통·복원에 회수와 차액 수입을 함께 반영한다", async () => {
  const { repository, read } = setup();
  await repository.saveOperation(input, "recovery", null);
  const saved = read().operations[0];
  await repository.saveOperation({ ...operationInputSchema.parse(saved), amount: "4500" }, saved.id, saved.revision);
  assert.equal(incomeMinor(read().operations[0]), 1000);
  assert.equal(operationPostings(read().operations, read().assets)[0].amount, 4500);
  await assert.rejects(repository.saveOperation({ ...input, amount: "5000" }, saved.id, saved.revision), { status: 409 });
  const updated = read().operations[0];
  const trash = await repository.moveToTrash("operation", updated.id, updated.revision);
  assert.equal(incomeOperations(read().operations).length, 0);
  assert.equal(operationPostings(read().operations, read().assets).length, 0);
  assert.equal(sharedRemaining(read().expenses[0], read().operations), 3500);
  await repository.restoreTrash(trash.id);
  assert.equal(incomeMinor(read().operations[0]), 1000);
  assert.equal(operationPostings(read().operations, read().assets).length, 1);
  const restored = read().operations[0];
  await repository.saveOperation({ ...operationInputSchema.parse(restored), amount: "3500", recoverySurplusAsIncome: false }, restored.id, restored.revision);
  assert.equal(incomeOperations(read().operations).length, 0);
  assert.equal(operationPostings(read().operations, read().assets)[0].amount, 3500);
});
