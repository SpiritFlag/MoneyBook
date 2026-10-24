import assert from "node:assert/strict";
import test from "node:test";
import { loanSampleSchema, loanScheduleCoverage, recordedLoanTotals, roundedLoanInterest, type LoanInterestCalculation } from "./loan";
import { exampleLoan, exampleCreditLoan, exampleLoans } from "./loan-sample";

test("대출의 확인 잔액과 기록된 납부 합계는 독립적이다", () => {
  const loan = structuredClone(exampleLoan);
  loan.remainingPrincipal = 8_000_000; // 일부 과거 이력만 입력한 경우
  const before = JSON.stringify(loan);
  assert.deepEqual(recordedLoanTotals(loan), { principal: 190_000, interest: 60_000, fee: 0, total: 250_000 });
  assert.equal(loan.remainingPrincipal, 8_000_000);
  assert.equal(JSON.stringify(loan), before);
});

test("납부 원금·이자·수수료 합계가 다르거나 회차가 중복된 표를 거절한다", () => {
  const invalid = structuredClone(exampleLoan);
  invalid.repayments[0].interest += 1;
  assert.equal(loanSampleSchema.safeParse(invalid).success, false);
  const duplicate = structuredClone(exampleLoan);
  duplicate.schedule.push({ ...duplicate.schedule[0] });
  assert.equal(loanSampleSchema.safeParse(duplicate).success, false);
});

test("회차별 예정 잔액은 원금만큼 줄고 이자는 원금에서 차감하지 않는다", () => {
  const loan = structuredClone(exampleLoan);
  loan.schedule[1].principalAfter -= loan.schedule[1].interest;
  assert.equal(loanSampleSchema.safeParse(loan).success, false);
});

test("예정과 실제가 같은 회차여도 범위를 중복 집계하지 않고 누락을 표시한다", () => {
  const loan = structuredClone(exampleLoan);
  assert.deepEqual(loanScheduleCoverage(loan), { covered: 4, missing: 56 });
  loan.schedule.push({ installment: 1, dueDate: null, principal: 1, interest: 0, fee: 0, total: 1, principalAfter: 1 });
  assert.deepEqual(loanScheduleCoverage(loan), { covered: 4, missing: 56 });
});

test("날짜가 없는 일정과 휴일 이연된 실제 납부일을 그대로 보존한다", () => {
  const loan = loanSampleSchema.parse(exampleLoan);
  assert.equal(loan.dueDay, 25);
  assert.equal(loan.repayments[0].date, "2026-09-28");
  assert.equal(loan.schedule[1].dueDate, null);
  assert.equal(loan.nextPayment?.date, "2026-10-25");
});

test("아직 납부하지 않은 대출의 예정표는 납부 합계나 현재 원금을 바꾸지 않는다", () => {
  const loan = structuredClone(exampleCreditLoan);
  assert.deepEqual(recordedLoanTotals(loan), { principal: 0, interest: 0, fee: 0, total: 0 });
  assert.equal(loan.remainingPrincipal, loan.originalPrincipal);
  assert.equal(loan.repayments.length, 0);
  assert.deepEqual(loanScheduleCoverage(loan), { covered: 2, missing: 34 });
});

test("첫 회차와 이후 회차의 상환 예정액이 달라도 각 원본 값을 유지한다", () => {
  const loan = structuredClone(exampleCreditLoan);
  loan.schedule[0].interest -= 1000;
  loan.schedule[0].total -= 1000;
  assert(loan.nextPayment);
  loan.nextPayment.total = loan.schedule[0].total;
  const parsed = loanSampleSchema.parse(loan);
  assert.notEqual(parsed.schedule[0].total, parsed.schedule[1].total);
  assert.equal(parsed.repayments.length, 0);
});

test("대출 여러 개를 서로 다른 ID와 독립된 납부 이력으로 유지한다", () => {
  assert.equal(new Set(exampleLoans.map((loan) => loan.id)).size, exampleLoans.length);
  assert.equal(exampleLoans[0].repayments.length, 1);
  assert.equal(exampleLoans[1].repayments.length, 0);
  assert.equal(exampleLoans[1].earlyRepaymentFeeShown, null);
});

test("일수 이자는 윤년에도 원본의 365일 기준과 원 단위 반올림을 유지한다", () => {
  const calculation: LoanInterestCalculation = { startDate: "2024-02-28", endDate: "2024-03-01", days: 3, principalBefore: 365_000, annualRate: "6", yearDays: 365, rounding: "nearest_won", sourceInterest: "180" };
  assert.equal(roundedLoanInterest(calculation), 180);
  assert.equal(roundedLoanInterest({ ...calculation, days: 1, principalBefore: 1000, annualRate: "18.25", sourceInterest: "0.5" }), 1);
  assert.equal(roundedLoanInterest({ ...calculation, days: 1, principalBefore: 1000, annualRate: "6", sourceInterest: "0.1643835616" }), 0);
});

test("원금 상환 없는 이자 납부와 긴 계산기간을 금액·일수 근거와 함께 검증한다", () => {
  const loan = structuredClone(exampleCreditLoan);
  const calculation: LoanInterestCalculation = { startDate: "2026-01-01", endDate: "2026-04-30", days: 120, principalBefore: 9_000_000, annualRate: "6", yearDays: 365, rounding: "nearest_won", sourceInterest: "177534.24657534247" };
  loan.repayments.push({ id: "interest-only", installment: 1, date: "2026-04-30", time: null, principal: 0, interest: 177_534, fee: 0, total: 177_534, principalAfter: 9_000_000, note: "가상 이자 납부", calculation });
  assert.equal(loanSampleSchema.safeParse(loan).success, true);
  assert.deepEqual(recordedLoanTotals(loan), { principal: 0, interest: 177_534, fee: 0, total: 177_534 });
  loan.repayments[0].calculation!.days = 119;
  assert.equal(loanSampleSchema.safeParse(loan).success, false);
});

test("개인 차입의 일수 근거가 있으면 이자와 상환 후 원금을 각각 검산한다", () => {
  const loan = structuredClone(exampleCreditLoan);
  loan.counterpartyType = "person";
  loan.maturityDateLabel = "계산표상 완납 예정일";
  const calculation: LoanInterestCalculation = { startDate: "2026-01-01", endDate: "2026-01-01", days: 1, principalBefore: 365_000, annualRate: "6", yearDays: 365, rounding: "nearest_won", sourceInterest: "60" };
  loan.repayments.push({ id: "personal-1", installment: 1, date: "2026-01-01", time: null, principal: 65_000, interest: 60, fee: 0, total: 65_060, principalAfter: 300_000, note: "가상 원금 상환", calculation });
  assert.equal(loanSampleSchema.safeParse(loan).success, true);
  loan.repayments[0].interest += 1;
  loan.repayments[0].total += 1;
  assert.equal(loanSampleSchema.safeParse(loan).success, false);
  loan.repayments[0].interest -= 1;
  loan.repayments[0].total -= 1;
  loan.repayments[0].principalAfter = 299_999;
  assert.equal(loanSampleSchema.safeParse(loan).success, false);
});

test("연도별 회차가 다시 시작하는 부분 예정표는 날짜로 구분하고 전체 회차를 추정하지 않는다", () => {
  const loan = structuredClone(exampleCreditLoan);
  loan.installmentCount = null;
  loan.scheduleThrough = "2027-01-20";
  loan.nextPayment = { date: "2026-12-20", total: loan.schedule[0].total, installment: null };
  loan.schedule.forEach((row, index) => {
    row.installment = null;
    row.dueDate = index === 0 ? "2026-12-20" : "2027-01-20";
    row.displayLabel = index === 0 ? "2026년 1회" : "2027년 1회";
  });
  const parsed = loanSampleSchema.parse(loan);
  assert.deepEqual(loanScheduleCoverage(parsed), { covered: 2, missing: null });
  assert(parsed.schedule.at(-1)!.principalAfter > 0);
  loan.schedule.push({ ...loan.schedule[1], dueDate: "2027-02-20" });
  assert.equal(loanSampleSchema.safeParse(loan).success, false);
});

test("회차 미확인 일정도 같은 날짜 중복과 원금 잔액 오류를 거절한다", () => {
  const loan = structuredClone(exampleCreditLoan);
  loan.installmentCount = null;
  loan.schedule.forEach((row) => { row.installment = null; });
  loan.schedule.push({ ...loan.schedule[0], displayLabel: "다른 표시명" });
  assert.equal(loanSampleSchema.safeParse(loan).success, false);
  loan.schedule.pop();
  loan.schedule[1].principalAfter -= 1;
  assert.equal(loanSampleSchema.safeParse(loan).success, false);
});

test("회차를 모르는 납입일 변경 이자는 실제 납부로 남고 원금을 줄이지 않는다", () => {
  const loan = structuredClone(exampleCreditLoan);
  loan.repayments.push({ id: "date-change", installment: null, date: "2026-10-22", time: "07:20:00", label: "납입일 변경 상환", principal: 0, interest: 1000, fee: 0, total: 1000, principalAfter: loan.originalPrincipal, note: "가상 납입일 변경 이자" });
  const parsed = loanSampleSchema.parse(loan);
  assert.equal(recordedLoanTotals(parsed).principal, 0);
  assert.equal(recordedLoanTotals(parsed).interest, 1000);
  assert.equal(loanScheduleCoverage(parsed).covered, 2);
});

test("거래내역만 있는 대출은 금리·만기·납입일·다음 납부를 모르는 상태로 보존한다", () => {
  const loan = structuredClone(exampleCreditLoan);
  loan.annualRate = null;
  loan.maturityDate = null;
  loan.dueDay = null;
  loan.nextPayment = null;
  loan.installmentCount = null;
  loan.schedule = [];
  const parsed = loanSampleSchema.parse(loan);
  assert.equal(parsed.annualRate, null);
  assert.equal(parsed.nextPayment, null);
  assert.deepEqual(loanScheduleCoverage(parsed), { covered: 0, missing: null });
  assert.equal(parsed.remainingPrincipal, exampleCreditLoan.remainingPrincipal);
});

test("지자체 지원과 연체 항목을 보존하고 실행·조건 변경을 납부액에 더하지 않는다", () => {
  const loan = structuredClone(exampleCreditLoan);
  loan.repayments = [{ id: "support", installment: null, date: "2026-10-25", time: null, principal: 10000, interest: 100, fee: 0, lateInterest: 2, lateFee: 1, total: 10103, principalAfter: 8990000, support: "local_government", note: "가상 지원 기록" }];
  loan.events = [
    { id: "drawdown", date: "2026-10-21", time: null, kind: "drawdown", label: "추가대출실행", amount: 100000, principalAfter: 9000000, note: "가상 추가 실행" },
    { id: "change", date: "2026-10-22", time: null, kind: "terms_change", label: "대출조건변경", amount: 0, principalAfter: null, note: "원본 잔액 0은 원금 감소가 아니다" },
  ];
  const parsed = loanSampleSchema.parse(loan);
  assert.deepEqual(recordedLoanTotals(parsed), { principal: 10000, interest: 102, fee: 1, total: 10103 });
  assert.equal(parsed.repayments[0].support, "local_government");
  assert.equal(parsed.events![1].principalAfter, null);
  assert.equal(parsed.remainingPrincipal, exampleCreditLoan.remainingPrincipal);
  loan.repayments[0].lateInterest = 3;
  assert.equal(loanSampleSchema.safeParse(loan).success, false);
  loan.repayments[0].lateInterest = 2;
  loan.events[1].amount = 1;
  assert.equal(loanSampleSchema.safeParse(loan).success, false);
  loan.events[1].amount = 0;
  loan.events.push({ ...loan.events[0] });
  assert.equal(loanSampleSchema.safeParse(loan).success, false);
});
