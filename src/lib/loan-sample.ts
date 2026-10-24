import { loanSampleSchema } from "./loan";

// 공개 예시는 가상 데이터다. 실제 캡처는 저장소 밖 로컬 미리보기에서만 사용한다.
export const exampleLoan = loanSampleSchema.parse({
  id: "sample", name: "예시은행 생활대출", institution: "예시은행",
  originalPrincipal: 12_000_000, remainingPrincipal: 11_810_000,
  informationDate: "2026-10-24", startDate: "2026-09-15", maturityDate: "2031-09-15",
  repaymentMethod: "원리금 균등분할상환", installmentCount: 60, dueDay: 25,
  annualRate: "6.000", rateComponents: [{ label: "기준금리", percent: "3.000" }, { label: "가산금리", percent: "3.100" }, { label: "우대금리", percent: "-0.100" }],
  nextPayment: { installment: 2, date: "2026-10-25", total: 250_000 }, earlyRepaymentFeeShown: 0,
  repayments: [{ id: "sample-repayment-1", installment: 1, date: "2026-09-28", time: "08:40:00", principal: 190_000, interest: 60_000, fee: 0, total: 250_000, principalAfter: 11_810_000, note: "휴일 때문에 납입일이 이연된 첫 상환이에요." }],
  schedule: [
    { installment: 2, dueDate: "2026-10-25", principal: 191_000, interest: 59_000, fee: 0, total: 250_000, principalAfter: 11_619_000 },
    { installment: 3, dueDate: null, principal: 192_000, interest: 58_000, fee: 0, total: 250_000, principalAfter: 11_427_000 },
    { installment: 4, dueDate: null, principal: 193_000, interest: 57_000, fee: 0, total: 250_000, principalAfter: 11_234_000 },
  ],
});

export const exampleCreditLoan = loanSampleSchema.parse({
  id: "credit-sample", name: "예시카드 신용대출", institution: "예시카드",
  originalPrincipal: 9_000_000, remainingPrincipal: 9_000_000,
  informationDate: "2026-10-24", startDate: "2026-10-21", maturityDate: "2029-10-20",
  repaymentMethod: "원리금 균등분할상환", termMonths: 36, installmentCount: 36, dueDay: 20,
  repaymentBank: "예시은행", repaymentAccountMasked: "가상 상환계좌",
  annualRate: "9.500", rateComponents: [],
  nextPayment: { installment: 1, date: "2026-11-20", total: 320_000 }, earlyRepaymentFeeShown: null,
  repayments: [],
  scheduleNote: "상환계획 예시예요. 예정표는 실제 납부 이력이 아니에요.",
  schedule: [
    { installment: 1, dueDate: "2026-11-20", principal: 250_000, interest: 70_000, fee: 0, total: 320_000, principalAfter: 8_750_000 },
    { installment: 2, dueDate: "2026-12-20", principal: 252_000, interest: 68_000, fee: 0, total: 320_000, principalAfter: 8_498_000 },
  ],
});

export const exampleLoans = [exampleLoan, exampleCreditLoan];
