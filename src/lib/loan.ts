import { z } from "zod";
import { parseDateQuery } from "./date";

const money = z.number().int().min(0).max(999_999_999_999);
const date = z.string().refine((value) => parseDateQuery(value) !== null, "날짜를 확인해 주세요.");
const installment = z.number().int().min(1).max(600);
const amounts = { principal: money, interest: money, fee: money, total: money };
const rate = z.string().regex(/^\d{1,2}(?:\.\d{1,6})?$/);

const interestCalculationSchema = z.object({
  startDate: date, endDate: date,
  days: z.number().int().min(1).max(36_600),
  principalBefore: money, annualRate: rate, yearDays: z.literal(365),
  rounding: z.literal("nearest_won"),
  sourceInterest: z.string().regex(/^\d+(?:\.\d+)?$/).max(80),
});
export type LoanInterestCalculation = z.infer<typeof interestCalculationSchema>;

// 원금 × 연이율(%) × 실제 일수 ÷ 365. 원 단위 반올림은 정수 연산으로 한다.
export function roundedLoanInterest(calculation: LoanInterestCalculation): number {
  const [whole, fraction = ""] = calculation.annualRate.split(".");
  const rateUnits = BigInt(whole) * BigInt(1_000_000) + BigInt(fraction.padEnd(6, "0"));
  const numerator = BigInt(calculation.principalBefore) * rateUnits * BigInt(calculation.days);
  const denominator = BigInt(100_000_000) * BigInt(calculation.yearDays);
  return Number((numerator * BigInt(2) + denominator) / (denominator * BigInt(2)));
}

export const loanSampleSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  institution: z.string().min(1),
  originalPrincipal: money,
  remainingPrincipal: money,
  informationDate: date,
  startDate: date,
  maturityDate: date.nullable(),
  repaymentMethod: z.string().min(1),
  counterpartyType: z.enum(["institution", "person"]).optional(),
  maturityDateLabel: z.string().min(1).optional(),
  calculationNote: z.string().min(1).optional(),
  termMonths: z.number().int().positive().max(600).optional(),
  repaymentBank: z.string().min(1).optional(),
  repaymentAccountMasked: z.string().min(1).optional(),
  lateRateNote: z.string().min(1).optional(),
  scheduleNote: z.string().min(1).optional(),
  scheduleThrough: date.optional(),
  scheduleBalanceSource: z.enum(["reported", "calculated"]).optional(),
  rateNote: z.string().min(1).optional(),
  originalPrincipalLabel: z.string().min(1).optional(),
  repaymentNote: z.string().min(1).optional(),
  installmentCount: installment.nullable(),
  dueDay: z.number().int().min(1).max(31).nullable(),
  annualRate: rate.nullable(),
  rateComponents: z.array(z.object({ label: z.string().min(1), percent: z.string().regex(/^-?\d{1,2}(?:\.\d{1,6})?$/) })),
  nextPayment: z.object({ date, total: money, installment: installment.nullable() }).nullable(),
  earlyRepaymentFeeShown: money.nullable(),
  repayments: z.array(z.object({
    id: z.string().min(1), installment: installment.nullable(), date, label: z.string().min(1).optional(),
    time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/).nullable(),
    lateInterest: money.optional(), lateFee: money.optional(),
    support: z.enum(["local_government", "unmarked"]).optional(),
    ...amounts, principalAfter: money.nullable(), note: z.string(), calculation: interestCalculationSchema.optional(),
  })).max(600),
  schedule: z.array(z.object({ installment: installment.nullable(), dueDate: date.nullable(), displayLabel: z.string().min(1).optional(), ...amounts, principalAfter: money, calculation: interestCalculationSchema.optional() })).max(600),
  events: z.array(z.object({
    id: z.string().min(1), date, time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/).nullable(),
    kind: z.enum(["drawdown", "terms_change"]), label: z.string().min(1),
    amount: money, principalAfter: money.nullable(), note: z.string(),
  })).max(600).optional(),
}).superRefine((loan, ctx) => {
  const fail = (path: (string | number)[], message: string) => ctx.addIssue({ code: "custom", path, message });
  if (loan.maturityDate !== null && loan.maturityDate < loan.startDate) fail(["maturityDate"], "만기일을 확인해 주세요.");
  if (loan.installmentCount !== null && loan.nextPayment && loan.nextPayment.installment !== null && loan.nextPayment.installment > loan.installmentCount) fail(["nextPayment", "installment"], "전체 회차를 초과했어요.");
  for (const collection of ["repayments", "schedule"] as const) {
    const seen = new Set<string | number>();
    loan[collection].forEach((row, index) => {
      const lateInterest = "lateInterest" in row ? row.lateInterest ?? 0 : 0;
      const lateFee = "lateFee" in row ? row.lateFee ?? 0 : 0;
      if (row.principal + row.interest + row.fee + lateInterest + lateFee !== row.total) fail([collection, index, "total"], "원금·이자·수수료 합계와 납부액이 달라요.");
      if (loan.installmentCount !== null && row.installment !== null && row.installment > loan.installmentCount) fail([collection, index, "installment"], "전체 회차를 초과했어요.");
      if (collection === "schedule" && "dueDate" in row) {
        if (row.installment === null && row.dueDate === null) fail([collection, index], "예정일 또는 회차가 필요해요.");
        if (loan.scheduleThrough && row.dueDate && row.dueDate > loan.scheduleThrough) fail([collection, index, "dueDate"], "등록 범위를 벗어난 일정이에요.");
      }
      const calculation = row.calculation;
      if (calculation) {
        const days = (Date.parse(calculation.endDate) - Date.parse(calculation.startDate)) / 86_400_000 + 1;
        if (days !== calculation.days) fail([collection, index, "calculation", "days"], "시작일·종료일을 포함한 계산 일수가 달라요.");
        if (roundedLoanInterest(calculation) !== row.interest) fail([collection, index, "interest"], "일수로 계산한 이자의 반올림 금액과 달라요.");
        if (calculation.principalBefore - row.principal !== row.principalAfter) fail([collection, index, "principalAfter"], "계산 전 원금과 상환 후 잔액이 달라요.");
      }
      const key = "id" in row ? row.id : row.installment ?? row.dueDate ?? `unknown:${index}`;
      if (seen.has(key)) fail([collection, index], "중복된 기록이에요.");
      seen.add(key);
    });
  }
  const eventIds = new Set<string>();
  loan.events?.forEach((event, index) => {
    if (eventIds.has(event.id)) fail(["events", index, "id"], "중복된 기록이에요.");
    eventIds.add(event.id);
    if (event.kind === "terms_change" && event.amount !== 0) fail(["events", index, "amount"], "조건 변경은 납부 금액으로 집계하지 않아요.");
  });
  const schedule = [...loan.schedule].sort((a, b) => a.dueDate && b.dueDate ? a.dueDate.localeCompare(b.dueDate) : (a.installment ?? 0) - (b.installment ?? 0));
  schedule.forEach((row, index) => {
    const previous = schedule[index - 1];
    if (!previous) return;
    let consecutive = previous.installment !== null && row.installment !== null && previous.installment + 1 === row.installment;
    if (previous.installment === null && row.installment === null && previous.dueDate && row.dueDate) {
      const [py, pm, pd] = previous.dueDate.split("-").map(Number);
      const [cy, cm, cd] = row.dueDate.split("-").map(Number);
      consecutive = (cy - py) * 12 + cm - pm === 1 && pd === cd;
    }
    if (consecutive && previous.principalAfter - row.principal !== row.principalAfter) {
      fail(["schedule"], `${row.dueDate ?? `${row.installment}회차`}의 원금과 상환 후 잔액을 확인해 주세요.`);
    }
  });
});

export type LoanSample = z.infer<typeof loanSampleSchema>;
export const loanBatchSchema = z.array(loanSampleSchema).min(1).max(200).superRefine((loans, ctx) => {
  const ids = new Set<string>();
  loans.forEach((loan, index) => {
    if (ids.has(loan.id)) ctx.addIssue({ code: "custom", path: [index, "id"], message: "중복된 대출 ID예요." });
    ids.add(loan.id);
  });
});

// 목록에는 수백 건의 이력을 싣지 않는다. 상세에서 원본 기록을 별도로 조회한다.
export function loanSummary(loan: LoanSample) {
  const { repayments, schedule, events, ...terms } = loan;
  return { ...terms, repaymentCount: repayments.length, scheduleCount: schedule.length, eventCount: events?.length ?? 0 };
}
export type LoanSummary = ReturnType<typeof loanSummary>;
export type LoanRepayment = LoanSample["repayments"][number];
export type LoanScheduleRow = LoanSample["schedule"][number];

// 현재 원금은 확인한 값이다. 납부 이력을 더한다고 다시 차감하지 않는다.
export function recordedLoanTotals(loan: LoanSample) {
  return loan.repayments.reduce((sum, row) => ({
    principal: sum.principal + row.principal, interest: sum.interest + row.interest + (row.lateInterest ?? 0),
    fee: sum.fee + row.fee + (row.lateFee ?? 0), total: sum.total + row.total,
  }), { principal: 0, interest: 0, fee: 0, total: 0 });
}

export function loanScheduleCoverage(loan: LoanSample) {
  if (loan.installmentCount === null) {
    const recorded = new Set([
      ...loan.schedule.map((row) => row.installment === null ? `date:${row.dueDate}` : `installment:${row.installment}`),
      ...loan.repayments.map((row) => row.installment === null ? `date:${row.date}` : `installment:${row.installment}`),
    ]);
    return { covered: recorded.size, missing: null };
  }
  const installments = new Set([...loan.schedule, ...loan.repayments].flatMap((row) => row.installment === null ? [] : [row.installment]));
  return { covered: installments.size, missing: loan.installmentCount - installments.size };
}

const wonFormatter = new Intl.NumberFormat("ko-KR");
export const loanWon = (value: number) => `${wonFormatter.format(value)}원`;
export const loanDate = (value: string) => value.replaceAll("-", ".");
