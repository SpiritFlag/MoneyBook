import test from "node:test";
import assert from "node:assert/strict";
import { monthlyLoanPayments, loanPaymentMonthSchema } from "./monthly-loan-payments";
import { exampleLoan } from "./loan-sample";
import { loanPaymentExpense, loanScheduleKey, loanScheduleBasis } from "./loan-payment";
import { createBookRepository, storedSchema } from "./expense-repository";
import { newAsset } from "./asset";

const loans = Array.from({ length: 8 }, (_, index) => ({ ...structuredClone(exampleLoan), id: `student-${index}`, name: "가상 학자금 대출", institution: "가상 장학기관", originalPrincipal: 2000000 + index * 100000, schedule: [structuredClone(exampleLoan.schedule[0])] }));
function payment(loan = loans[0], date = "2026-11-02") {
  const schedule = loan.schedule[0];
  return { loanId: loan.id, scheduleKey: loanScheduleKey(schedule), scheduleBasis: loanScheduleBasis(schedule), date, time: null, assetId: "bank", principal: schedule.principal, interest: schedule.interest, fee: 0, memo: "가상 납입" };
}

test("같은 기관·같은 이름의 대출 8건을 월별 표에 모두 반환하고 식별·합계를 보존한다", () => {
  const month = monthlyLoanPayments(loans, [], "2026-10");
  assert.equal(month.rows.length, 8);
  assert.equal(new Set(month.rows.map(row => row.id)).size, 8);
  assert.equal(new Set(month.rows.map(row => row.loan.originalPrincipal)).size, 8);
  assert.equal(month.totals.scheduled, 2000000);
  assert.equal(month.totals.principal, 1528000);
  assert.equal(month.totals.interest, 472000);
  assert.equal(month.totals.paidCount, 0);
  assert.equal(month.totals.pending, 2000000);
  assert.ok(month.rows.every(row => row.status === "pending" && row.existing === null));
});

test("10월 예정·11월 실제 출금도 10월 표에서 납입 상태·수정 원본을 반환한다", () => {
  const expense = loanPaymentExpense(payment(), loans[0], loans[0].schedule[0], { id: "bank", name: "가상 계좌" }, "expense");
  const month = monthlyLoanPayments(loans, [expense], "2026-10");
  const row = month.rows.find(row => row.loan.id === loans[0].id)!;
  assert.equal(row.status, "linked");
  assert.equal(row.schedule.dueDate, "2026-10-25");
  assert.equal(row.payment?.date, "2026-11-02");
  assert.equal(row.existing?.id, expense.id);
  assert.equal(row.existing?.revision, 1);
  assert.equal(month.totals.paid, 250000);
  assert.equal(month.totals.paidCount, 1);
  assert.equal(month.totals.pending, 1750000);
  assert.equal(monthlyLoanPayments(loans, [expense], "2026-11").rows.length, 0);
});

test("기존 납부 이력은 수정할 출금으로 오인하지 않으며 실제 납입액과 예정액을 구분한다", () => {
  const loan = structuredClone(loans[0]);
  loan.repayments.push({ ...loan.repayments[0], id: "legacy-paid", installment: 2, date: "2026-10-27", principal: 191000, interest: 60000, fee: 1000, total: 252000 });
  const month = monthlyLoanPayments([loan], [], "2026-10");
  assert.equal(month.rows[0].status, "legacy");
  assert.equal(month.rows[0].existing, null);
  assert.equal(month.totals.scheduled, 250000);
  assert.equal(month.totals.paid, 252000);
  assert.equal(month.totals.pending, 0);
});

test("예정일 미확인·다른 월 일정은 임의 배정하지 않고 빈 월·잘못된 월을 처리한다", () => {
  const month = monthlyLoanPayments([exampleLoan], [], "2026-11");
  assert.equal(month.rows.length, 0);
  assert.equal(month.unknownDateCount, 2);
  assert.equal(month.totals.scheduled, 0);
  for (const invalid of ["2026-13", "2026-1", "2026-10-25", "", "0000-01"]) assert.equal(loanPaymentMonthSchema.safeParse(invalid).success, false);
  assert.throws(() => monthlyLoanPayments([], [], "2026-99"));
});

test("월별 조회는 계정 원본 한 번에서 납입 수정·휴지통·복원 현황을 함께 갱신한다", async () => {
  let saved = storedSchema.parse({ version: 1, expenses: [], loans, assets: [{ ...newAsset("2026-10-01"), id: "bank", name: "가상 계좌", kind: "account", revision: 1, createdAt: "2026-10-01", updatedAt: "2026-10-01" }] });
  let reads = 0;
  const repository = createBookRepository({ read: async () => { reads++; return structuredClone(saved); }, transact: async action => action(structuredClone(saved), async book => { saved = storedSchema.parse(structuredClone(book)); }) });
  assert.equal((await repository.listMonthlyLoanPayments("2026-10")).rows.length, 8);
  assert.equal(reads, 1);
  await repository.saveLoanPayment(payment(), "expense", null);
  await repository.saveLoanPayment({ ...payment(), interest: 60000 }, "expense", 1);
  assert.equal((await repository.listMonthlyLoanPayments("2026-10")).totals.paid, 251000);
  const entry = await repository.moveToTrash("expense", "expense", 2);
  assert.equal((await repository.listMonthlyLoanPayments("2026-10")).totals.paidCount, 0);
  await repository.restoreTrash(entry.id);
  const restored = await repository.listMonthlyLoanPayments("2026-10");
  assert.equal(restored.totals.paidCount, 1);
  assert.equal(restored.rows.find(row => row.status === "linked")?.existing?.revision, 3);
  assert.equal(monthlyLoanPayments([], saved.expenses, "2026-10").rows.length, 0, "Another account must not see loans linked only in this book");
});
