import test from "node:test";
import assert from "node:assert/strict";
import { normalizeTime } from "./input-time";
import { changeExpenseDate, changeExpenseTime, expenseOrderReferences, followsPaymentTime, followsPaymentDate, newExpense, expenseInputSchema } from "./expense";
import { createBookRepository, storedSchema, type Book } from "./expense-repository";

test("24시간 입력은 0시·오후·마지막 분과 빈 값, 잘못된 시각을 구분한다", () => {
  for (const [input, output] of [["0000", "00:00"], ["1830", "18:30"], ["2359", "23:59"], ["7:5", "07:05"], ["", null], ["2400", "2400"], ["1260", "1260"]]) assert.equal(normalizeTime(input!), output);
  const base = { ...newExpense("2026-10-19"), title: "입력 검증", paymentMethod: "카드", paidAmount: "1000" };
  assert.equal(expenseInputSchema.safeParse({ ...base, time: normalizeTime("2400") }).success, false);
  assert.equal(expenseInputSchema.safeParse({ ...base, time: normalizeTime("1830") }).success, true);
});
test("이용일은 결제일을 따르다가 명시적 수정 후 저장·재조회에도 유지한다", () => {
  const base = { ...newExpense("2026-10-19"), title: "입력 검증", paymentMethod: "카드", paidAmount: "1000" };
  const moved = changeExpenseDate(base, "paymentDate", "2026-10-01");
  assert.equal(moved.useDate, "2026-10-01");
  const independent = changeExpenseDate(moved, "useDate", "2026-10-03");
  const saved = expenseInputSchema.parse(JSON.parse(JSON.stringify(independent)));
  assert.equal(changeExpenseDate(saved, "paymentDate", "2026-10-02").useDate, "2026-10-03");
  const explicitSame = changeExpenseDate(moved, "useDate", moved.paymentDate);
  assert.equal(changeExpenseDate(explicitSame, "paymentDate", "2026-10-02").useDate, "2026-10-01");
  const reconnected = { ...saved, useDate: saved.paymentDate, useDateFollowsPayment: true };
  assert.equal(changeExpenseDate(reconnected, "paymentDate", "2026-10-04").useDate, "2026-10-04");
  assert.equal(followsPaymentDate({ ...base, useDateFollowsPayment: undefined }), true);
  assert.equal(followsPaymentDate({ ...base, useDateFollowsPayment: undefined, useDate: "2026-10-03" }), false);
});

test("기간형 시작일을 지웠다가 과거 날짜로 입력해도 새벽 시각과 초안을 유지한다", () => {
  const base = changeExpenseTime({ ...newExpense("2026-10-19"), title: "구독", paymentMethod: "카드", paidAmount: "5900", useKind: "period" as const, useEnd: "2026-11-02" }, "time", "03:30");
  const empty = changeExpenseDate(base, "useDate", "");
  assert.deepEqual(expenseOrderReferences([], empty), []);
  assert.equal(empty.useTime, "03:30");
  assert.equal(expenseInputSchema.safeParse(empty).success, false);
  const past = changeExpenseDate(empty, "useDate", "2026-10-03");
  assert.equal(expenseInputSchema.safeParse(past).success, true);
  assert.equal(past.paymentDate, "2026-10-19");
  assert.equal(past.useDate, "2026-10-03");
  assert.equal(past.useEnd, "2026-11-02");
  assert.deepEqual(expenseOrderReferences([], past), []);
});

test("이용 시각은 결제 시각을 따르고 별도 입력을 선택하면 독립적으로 유지한다", () => {
  const base = newExpense("2026-10-19");
  assert.equal(followsPaymentTime(base), true);
  const linked = changeExpenseTime(base, "time", "09:30");
  assert.equal(linked.useTime, "09:30");
  assert.equal(changeExpenseTime(linked, "time", null).useTime, null);
  const independent = changeExpenseTime(linked, "useTime", "10:00");
  assert.equal(followsPaymentTime(independent), false);
  assert.equal(changeExpenseTime(independent, "time", "08:00").useTime, "10:00");
  const unknown = changeExpenseTime(independent, "useTime", null);
  assert.equal(changeExpenseTime(unknown, "time", "08:00").useTime, null);
  // Equal times can still be explicitly independent.
  const same = changeExpenseTime(linked, "useTime", "09:30");
  assert.equal(changeExpenseTime(same, "time", "08:00").useTime, "09:30");
  assert.equal(followsPaymentTime({ ...base, time: "09:00", useTime: "10:00" }), false);
  assert.equal(followsPaymentTime({ ...base, time: "09:00", useTime: null }), false);
});

test("시각 자동 연결은 저장 후에도 유지하고 기존 기록의 별도 시각은 보존한다", async () => {
  let book: Book = storedSchema.parse({ version: 1, expenses: [], assets: [], operations: [] });
  const repo = createBookRepository({ read: async () => structuredClone(book), transact: async fn => fn(structuredClone(book), async next => { book = structuredClone(next); }) });
  const base = { ...newExpense("2026-10-19"), title: "시각 검증", paymentMethod: "카드", paidAmount: "1000" };
  await repo.save({ ...base, time: "04:30", useTime: "09:00", useTimeFollowsPayment: true }, "linked", null);
  const linked = (await repo.list())[0];
  assert.equal(linked.useTime, "04:30");
  assert.equal(followsPaymentTime(linked), true);
  await repo.save(changeExpenseTime(linked, "time", "08:00"), linked.id, linked.revision);
  assert.equal((await repo.list())[0].useTime, "08:00");
  await repo.save({ ...base, time: "09:00", useTime: null, useTimeFollowsPayment: false }, "separate", null);
  assert.equal((await repo.list()).find(e => e.id === "separate")?.useTime, null);
  await repo.save({ ...base, time: "09:00", useTime: "10:00" }, "legacy", null);
  assert.equal((await repo.list()).find(e => e.id === "legacy")?.useTime, "10:00");
});
