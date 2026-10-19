import test from "node:test";
import assert from "node:assert/strict";
import { normalizeTime } from "./input-time";
import { changeExpenseDate, followsPaymentDate, newExpense, expenseInputSchema } from "./expense";

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
