import test from "node:test";
import assert from "node:assert/strict";
import { createBookRepository, storedSchema, type Book } from "./expense-repository";
import { exampleLoan } from "./loan-sample";
import { newAsset, assetLedger } from "./asset";
import { expenseInputSchema, consumptionKrw } from "./expense";
import { loanPaymentInputSchema, loanScheduleKey, loanScheduleBasis, loansWithPayments, scheduleRepayment, type LoanPaymentInput } from "./loan-payment";
import { loanSummary, loanSampleSchema, loanScheduleCoverage } from "./loan";

function setup(patch: Partial<Book> = {}) {
  let saved = storedSchema.parse({ version: 1, expenses: [], loans: [exampleLoan], assets: [{ ...newAsset("2026-10-01"), id: "bank", name: "가상 계좌", kind: "account", openingBalance: "1000000", revision: 1, createdAt: "2026-10-01", updatedAt: "2026-10-01" }], ...patch });
  const repository = createBookRepository({ read: async () => structuredClone(saved), transact: async action => action(structuredClone(saved), async book => { saved = storedSchema.parse(structuredClone(book)); }) });
  return { repository, read: () => structuredClone(saved) };
}
function input(patch: Partial<LoanPaymentInput> = {}): LoanPaymentInput {
  const row = exampleLoan.schedule[0];
  return { loanId: exampleLoan.id, scheduleKey: loanScheduleKey(row), scheduleBasis: loanScheduleBasis(row), date: "2026-10-27", time: "08:30", assetId: "bank", principal: row.principal, interest: row.interest, fee: row.fee, memo: "가상 납입", ...patch };
}

test("10/25 일정으로 10/27에 납입하면 예정일을 보존하고 실제 출금일에 원장·이자 소비·대출 이력을 반영한다", async () => {
  const { repository, read } = setup();
  const record = await repository.saveLoanPayment(input(), "payment", null);
  assert.equal(record.loanPayment?.dueDate, "2026-10-25");
  assert.equal(record.paymentDate, "2026-10-27");
  assert.equal(record.useDate, "2026-10-27");
  assert.equal(consumptionKrw(record), 59000);
  const ledger = assetLedger(read().assets[0], read().expenses);
  assert.equal(ledger.length, 1);
  assert.equal(ledger[0].amount, -250000);
  assert.equal(ledger[0].after, 750000);
  const loan = (await repository.listLoans())[0];
  assert.equal(loan.repayments.length, 2);
  assert.equal(loan.repayments[1].date, "2026-10-27");
  assert.equal(loan.repayments[1].scheduledDueDate, "2026-10-25");
  assert.equal(loan.repayments[1].expenseId, record.id);
  assert.equal(loanSummary(loan).repaymentCount, 2);
  assert.equal(loanSampleSchema.safeParse(loan).success, true);
  assert.deepEqual(read().loans[0], exampleLoan, "Imported loan notes and original schedules must remain unchanged");
  assert.equal(loansWithPayments(read().loans, read().expenses, "2026-10-31")[0].recordedRemainingPrincipal, 11619000);
  assert.equal(loansWithPayments(read().loans, read().expenses, "2026-10-26")[0].recordedRemainingPrincipal, exampleLoan.remainingPrincipal);
});

test("같은 회차 중복·재시도·오래된 수정·일반 지출 수정 우회를 검증한다", async () => {
  const { repository, read } = setup();
  await repository.saveLoanPayment(input(), "payment", null);
  await repository.saveLoanPayment(input(), "payment", null);
  assert.equal(read().expenses.length, 1);
  await assert.rejects(repository.saveLoanPayment(input(), "duplicate", null), { status: 400 });
  await assert.rejects(repository.saveLoanPayment(input({ interest: 60000 }), "payment", null), { status: 409 });
  const changed = await repository.saveLoanPayment(input({ date: "2026-10-28", interest: 60000, fee: 1000 }), "payment", 1);
  assert.equal(changed.paidAmount, "252000");
  assert.equal(changed.revision, 2);
  assert.equal(consumptionKrw(changed), 61000);
  assert.equal((await repository.listLoans())[0].repayments.at(-1)?.date, "2026-10-28");
  await assert.rejects(repository.saveLoanPayment(input(), "payment", 1), { status: 409 });
  await assert.rejects(repository.save(expenseInputSchema.parse(changed), "payment", 2), { status: 400 });
  assert.equal(read().expenses.length, 1);
});

test("휴지통 이동은 대출·계좌에서 함께 제외하고 복원 시 중복을 다시 검증한다", async () => {
  const { repository, read } = setup();
  await repository.saveLoanPayment(input(), "payment", null);
  const entry = await repository.moveToTrash("expense", "payment", 1);
  assert.equal((await repository.listLoans())[0].repayments.length, 1);
  assert.equal(assetLedger(read().assets[0], read().expenses).length, 0);
  assert.equal(scheduleRepayment((await repository.listLoans())[0], exampleLoan.schedule[0]), undefined);
  await repository.restoreTrash(entry.id);
  assert.equal((await repository.listLoans())[0].repayments.length, 2);
  const again = await repository.moveToTrash("expense", "payment", 2);
  await repository.saveLoanPayment(input(), "replacement", null);
  await assert.rejects(repository.restoreTrash(again.id), { status: 400 });
  assert.equal(read().expenses.length, 1);
  assert.equal((await repository.listTrash()).length, 1);
});

test("기존 납부 이력·다른 계정·잘못된 계좌·변경된 일정·과도한 원금을 거절한다", async () => {
  const { repository, read } = setup();
  await assert.rejects(setup({ loans: [] }).repository.saveLoanPayment(input(), "payment", null), { status: 404 });
  await assert.rejects(repository.saveLoanPayment(input({ assetId: "other-account" }), "payment", null), { status: 400 });
  await assert.rejects(repository.saveLoanPayment(input({ scheduleBasis: "old schedule" }), "payment", null), { status: 409 });
  await assert.rejects(repository.saveLoanPayment(input({ principal: exampleLoan.remainingPrincipal + 1 }), "payment", null), { status: 400 });
  const paidLoan = { ...exampleLoan, repayments: [...exampleLoan.repayments, { ...exampleLoan.repayments[0], id: "legacy", installment: 2, date: "2026-10-26" }] };
  await assert.rejects(setup({ loans: [paidLoan] }).repository.saveLoanPayment(input(), "payment", null), { status: 400 });
  assert.equal(read().expenses.length, 0);
});

test("회차 번호 없는 일정도 실제 출금일이 달라도 같은 일정으로 식별하며 확인일 이전 원금은 재차 차감하지 않는다", async () => {
  const row = { ...exampleLoan.schedule[0], installment: null, displayLabel: "2026년 납입" };
  const loan = { ...exampleLoan, installmentCount: null, schedule: [row], informationDate: "2026-10-28" };
  const { repository, read } = setup({ loans: [loan] });
  await repository.saveLoanPayment(input({ scheduleKey: loanScheduleKey(row), scheduleBasis: loanScheduleBasis(row) }), "payment", null);
  const effective = loansWithPayments(read().loans, read().expenses, "2026-10-31")[0];
  assert.equal(effective.recordedRemainingPrincipal, loan.remainingPrincipal);
  assert.equal(scheduleRepayment(effective, row)?.date, "2026-10-27");
  assert.equal(effective.nextPayment, null);
  assert.equal(loanScheduleCoverage(effective).covered, loanScheduleCoverage(loan).covered, "Changed debit dates must not create extra scheduled installments");
});

test("이자만 납부·다음 일정 이동·입력 금액과 날짜를 검증한다", async () => {
  const future = { ...exampleLoan.schedule[1], dueDate: "2026-11-25" };
  const { repository } = setup({ loans: [{ ...exampleLoan, schedule: [exampleLoan.schedule[0], future] }] });
  const record = await repository.saveLoanPayment(input({ principal: 0, interest: 1000 }), "interest-only", null);
  assert.equal(consumptionKrw(record), 1000);
  assert.equal((await repository.listLoans())[0].nextPayment?.date, "2026-11-25");
  assert.equal(loanPaymentInputSchema.safeParse(input({ date: "2026-02-30" })).success, false);
  assert.equal(loanPaymentInputSchema.safeParse(input({ principal: -1 })).success, false);
  assert.equal(loanPaymentInputSchema.safeParse(input({ principal: 0, interest: 0, fee: 0 })).success, false);
});
