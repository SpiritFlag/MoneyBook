import assert from "node:assert/strict";
import test from "node:test";
import { bookDate, todayInBook } from "./date";
import { appearsOnDay, dailyExpensePresentation, dailyExpenses, expenseOrderReferences, daySummary, monthAmount, newExpense, type Expense } from "./expense";
import { dailyRecords, dailyOrderReferences } from "./daily-records";
import { changeOperationDate, newOperation, newRow, operationSchema, operationPostings, operationExpenses, transferOrderWarning, type Operation } from "./operations";
import { createBookRepository, storedSchema, type Book } from "./expense-repository";
import { newAsset, assetLedger, type Asset } from "./asset";
const meta = { revision: 1, createdAt: "2026-10-01", updatedAt: "2026-10-01" };

test("시각 없는 지출은 자산 이동 단계·교통을 기준으로 저장하고 일일·원장 순서를 유지한다", async () => {
  let stored: Book = storedSchema.parse({ version: 1, expenses: [] });
  const repo = createBookRepository({ read: async () => structuredClone(stored), transact: async fn => fn(structuredClone(stored), async book => { stored = structuredClone(book); }) });
  const date = "2026-10-01";
  await repo.saveAsset({ ...newAsset(date), name: "계좌", openingBalance: "10000" }, "bank", null);
  await repo.saveAsset({ ...newAsset(date), name: "지갑", kind: "stored", openingBalance: "0" }, "wallet", null);
  const transferId = "11111111-1111-4111-8111-111111111111", stepId = "22222222-2222-4222-8222-222222222222";
  const anchor = `transfer:${transferId}/${stepId}`;
  await repo.saveOperation({ ...newOperation("transfer", date), rows: [{ ...newRow(date, stepId), fromId: "bank", toId: "wallet", amount: "1000", received: "1000", time: "10:00" }] }, transferId, null);
  await repo.saveOperation({ ...newOperation("transit", date), assetId: "wallet", amount: "100", time: "10:30", rows: [{ ...newRow(date, "board"), name: "역", time: "10:30", amount: "100" }] }, "trip", null);
  const input = { ...expense("game", date, null), paidAmount: "500", paymentKind: "stored" as const, assetId: "wallet", orderReference: anchor };
  await repo.save(input, input.id, null);
  const book = { expenses: await repo.list(), assets: await repo.listAssets(), operations: await repo.listOperations() };
  assert.equal(book.expenses[0].orderReference, anchor);
  assert.equal(book.expenses[0].useTime, null);
  const refs = dailyOrderReferences(book, book.expenses[0], input.id);
  assert.deepEqual(refs.map(r => r.id), [anchor, "operation:trip"]);
  const records = () => dailyRecords(dailyExpenses([...book.expenses, ...operationExpenses(book.operations)], date), book.operations, date).map(r => r.id);
  assert.deepEqual(records(), ["game", "operation:trip"]);
  let ledger = assetLedger(book.assets.find(a => a.id === "wallet")!, book.expenses, operationPostings(book.operations, book.assets));
  assert.equal(ledger[1].entry.id, "game");
  await repo.save({ ...book.expenses[0], orderReference: "operation:trip" }, input.id, book.expenses[0].revision);
  book.expenses = await repo.list();
  assert.deepEqual(records(), ["operation:trip", "game"]);
  ledger = assetLedger(book.assets.find(a => a.id === "wallet")!, book.expenses, operationPostings(book.operations, book.assets));
  assert.equal(ledger.at(-1)?.entry.id, "game");
  assert.deepEqual(dailyOrderReferences(book, { ...input, useDate: "" }), []);
  assert.deepEqual(dailyOrderReferences(book, { ...input, useDate: "2026-02-30" }), []);
  const dawn = { ...book.operations[0], rows: [{ ...book.operations[0].rows[0], date: "2026-10-02", time: "04:59" }] };
  assert.ok(dailyOrderReferences({ ...book, operations: [dawn] }, input).some(r => r.id === anchor));
  dawn.rows[0].time = "05:00";
  assert.ok(!dailyOrderReferences({ ...book, operations: [dawn] }, input).some(r => r.id === anchor));
});

test("숨겨진 21:16 자산 이동은 시각만 빌려 정렬하고 소비 목록에는 표시하지 않는다", () => {
  const date = "2026-10-01";
  const transfer: Operation = { ...newOperation("transfer", date), ...meta, id: "charge", title: "로스트아크 충전", rows: [{ ...newRow(date, "step"), time: "21:16", fromId: "bank", toId: "game", amount: "10000", received: "10000" }] };
  const before = expense("21:15", date, "21:15"), after = expense("21:17", date, "21:17");
  const unknown = { ...expense("unknown", date, null), orderReference: "transfer:charge/step" };
  const values = [before, after, unknown];
  assert.deepEqual(dailyRecords(dailyExpenses(values, date), [transfer], date).map(r => r.id), ["21:15", "unknown", "21:17"]);
  assert.equal(unknown.time, null);
  assert.equal(unknown.useTime, null);
  assert.equal(daySummary(values, date).total, 3000);
  const same = expense("21:16", date, "21:16");
  const earlier = { ...unknown, orderSide: "before" as const };
  const result = dailyRecords(dailyExpenses([before, same, after, earlier], date), [transfer], date);
  assert.ok(result.findIndex(r => r.id === "unknown") > result.findIndex(r => r.id === "21:15"));
  assert.ok(result.findIndex(r => r.id === "unknown") < result.findIndex(r => r.id === "21:17"));
  assert.ok(!result.some(r => r.transfer));
});
test("시각 미확인 소비는 같은 장부일의 기간형 결제와 새벽 거래도 순서 기준으로 고른다", () => {
  const game = expense("game", "2026-10-01", null);
  const subscription = { ...expense("카카오T", "2026-10-01", "10:19"), useKind: "period" as const, useDate: "2026-10-03", useEnd: "2026-11-02" };
  const dawn = expense("dawn", "2026-10-02", "01:00");
  const previousDay = expense("previous", "2026-10-01", "04:59");
  const nextDay = expense("next", "2026-10-02", "05:00");
  const values = [game, subscription, dawn, previousDay, nextDay];
  assert.deepEqual(expenseOrderReferences(values, game, game.id).map(e => e.id), ["카카오T", "dawn"]);
  const ordered = values.map(e => e.id === game.id ? { ...e, orderReference: subscription.id, orderSide: "after" as const } : e);
  assert.deepEqual(dailyRecords(dailyExpenses(ordered, "2026-10-01"), [], "2026-10-01").map(r => r.id), ["카카오T", "game", "dawn"]);
  assert.equal(daySummary(ordered, "2026-10-01").total, 2000);
});
function expense(id: string, date: string, time: string | null): Expense {
  return { ...newExpense(date), ...meta, id, title: id, paymentMethod: "지갑", paidAmount: "1000", time, useTime: time };
}
function income(id: string, date: string, time: string | null): Operation {
  return { ...newOperation("income", date), ...meta, id, title: id, amount: "2", time };
}

test("일일 거래는 기본 결제일·초록 이용 전용·파랑 결제 전용·보라 기간형으로 구분한다", () => {
  const normal = { ...expense("normal", "2026-10-01", "11:10"), useTime: "12:00" };
  assert.deepEqual(dailyExpensePresentation(normal, "2026-10-01"), { kind: "normal", date: "2026-10-01", time: "11:10" });
  const deferred = { ...normal, useDate: "2026-10-02", useTime: "18:00" };
  assert.deepEqual(dailyExpensePresentation(deferred, "2026-10-01"), { kind: "payment-only", date: "2026-10-01", time: "11:10" });
  assert.deepEqual(dailyExpensePresentation(deferred, "2026-10-02"), { kind: "usage-only", date: "2026-10-02", time: "18:00" });
  const recurring = { ...normal, useKind: "period" as const, useDate: "2026-09-01", useEnd: "2026-09-30", useTime: null };
  assert.deepEqual(dailyExpensePresentation(recurring, "2026-10-01"), { kind: "recurring", date: "2026-10-01", time: "11:10" });
  const dawn = { ...normal, paymentDate: "2026-10-02", time: "02:03", useDate: "2026-10-02", useTime: "18:00" };
  assert.equal(dailyExpensePresentation(dawn, "2026-10-01").kind, "payment-only");
  assert.equal(dailyExpensePresentation(dawn, "2026-10-02").kind, "usage-only");
  assert.equal(dailyExpensePresentation({ ...normal, time: null, useTime: null }, "2026-10-01").kind, "normal");
});
test("한국 시간 05시와 월·연 경계, 미확인 시각을 구분한다", () => {
  assert.equal(todayInBook(new Date("2026-10-01T04:59:59+09:00")), "2026-09-30");
  assert.equal(todayInBook(new Date("2026-10-01T05:00:00+09:00")), "2026-10-01");
  assert.equal(bookDate("2027-01-01", "00:00"), "2026-12-31");
  assert.equal(bookDate("2026-10-01", null), "2026-10-01");
});
test("새벽 소비는 전날·전월로 묶고 실제 거래 날짜와 금액은 보존한다", () => {
  const row = expense("dawn", "2026-10-01", "04:59");
  assert.equal(appearsOnDay(row, "2026-09-30"), true);
  assert.equal(appearsOnDay(row, "2026-10-01"), false);
  assert.equal(daySummary([row], "2026-09-30").total, 1000);
  assert.equal(monthAmount(row, "2026-09"), 1000);
  assert.equal(monthAmount(row, "2026-10"), undefined);
  assert.equal(row.paymentDate, "2026-10-01");
  assert.equal(row.useDate, "2026-10-01");
});
test("수입과 지출을 05시부터 시간순으로 합치고 수입은 소비에 더하지 않는다", () => {
  const date = "2026-09-30";
  const expenses = [expense("night", date, "23:00"), expense("unknown", date, null), expense("morning", date, "05:00")];
  const incomes = [income("dawn", "2026-10-01", "01:48"), income("next-day", "2026-10-01", "05:00"), income("noon", date, "12:00")];
  assert.deepEqual(dailyRecords(dailyExpenses(expenses, date), incomes, date).map(r => r.id), ["morning", "noon", "night", "dawn", "unknown"]);
  assert.equal(daySummary(expenses, date).total, 3000);
  const legacy = { ...incomes[0], incomeCategory: undefined };
  assert.equal(operationSchema.parse(legacy).incomeCategory, "other");
});
test("이체 대표 날짜는 같은 날짜의 단계에 반영하고 별도로 지정한 날짜는 보존한다", () => {
  const transfer = { ...newOperation("transfer", "2026-10-19"), rows: [newRow("2026-10-19", "1"), newRow("2026-10-20", "2")] };
  const changed = changeOperationDate(transfer, "2026-10-01");
  assert.deepEqual(changed.rows.map(r => r.date), ["2026-10-01", "2026-10-20"]);
  assert.equal(transfer.rows[0].date, "2026-10-19");
  assert.equal(transferOrderWarning({ ...transfer, rows: [...transfer.rows].reverse() }), true);
  assert.equal(transferOrderWarning(changed), false);
});
test("원장은 실제 날짜순을 지키며 같은 시각의 연속 이동은 10단계 이후에도 숫자순이다", () => {
  const asset: Asset = { ...newAsset("2026-10-01"), ...meta, id: "bank", name: "bank", openingBalance: "0" };
  const op: Operation = { ...newOperation("transfer", "2026-10-01"), ...meta, id: "transfer", rows: Array.from({length: 12}, (_, i) => ({ ...newRow("2026-10-01", String(i)), time: "05:02", toId: "bank", received: "1" })) };
  const rows = assetLedger(asset, [], operationPostings([op], [asset]));
  assert.deepEqual(rows.map(r => r.after), Array.from({length: 12}, (_, i) => i + 1));
  assert.deepEqual(rows.map(r => r.entry.id), Array.from({length: 12}, (_, i) => `transfer/${i}-in`));
  const dated = { ...op, rows: [{ ...op.rows[0], date: "2026-10-19" }, { ...op.rows[1], date: "2026-10-01" }] };
  assert.equal(assetLedger(asset, [], operationPostings([dated], [asset]))[0].entry.id, "transfer/1-in");
});
