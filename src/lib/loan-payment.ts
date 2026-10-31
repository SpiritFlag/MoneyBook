import { z } from "zod";
import { parseDateQuery, todayInSeoul } from "./date";
import { newExpense, expenseSchema, type Expense } from "./expense";
import { loanSampleSchema, type LoanSample, type LoanScheduleRow, type LoanRepayment } from "./loan";

const money = z.number().int().min(0).max(999_999_999_999);
export const loanPaymentInputSchema = z.object({
  loanId: z.string().min(1).max(120), scheduleKey: z.string().min(1).max(120),
  scheduleBasis: z.string().min(1).max(3000),
  date: z.string().refine(value => parseDateQuery(value) !== null, "실제 출금일을 확인해 주세요."),
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable(),
  assetId: z.string().min(1).max(80), principal: money, interest: money, fee: money,
  memo: z.string().max(2000),
}).superRefine((value, ctx) => {
  const total = value.principal + value.interest + value.fee;
  if (total <= 0 || total > 999_999_999_999) ctx.addIssue({ code: "custom", message: "납입액 합계를 확인해 주세요.", path: ["principal"] });
});
export type LoanPaymentInput = z.infer<typeof loanPaymentInputSchema>;
export const loanScheduleKey = (row: LoanScheduleRow) => row.installment !== null ? `installment:${row.installment}` : `date:${row.dueDate}`;
export const loanScheduleBasis = (row: LoanScheduleRow) => JSON.stringify(loanSampleSchema.shape.schedule.element.parse(row));
export function scheduleRepayment(loan: LoanSample, row: LoanScheduleRow) {
  return loan.repayments.find(payment => payment.scheduleKey
    ? payment.scheduleKey === loanScheduleKey(row)
    : row.installment !== null ? payment.installment === row.installment : row.dueDate !== null && payment.date === row.dueDate);
}

export function loanPaymentExpense(input: LoanPaymentInput, loan: LoanSample, row: LoanScheduleRow, account: { id: string; name: string }, id: string, previous?: Expense): Expense {
  const now = new Date().toISOString();
  const items = [
    { id: "principal", name: "대출 원금 상환", category: "loan" as const, unitPrice: String(input.principal), quantity: 1, discounts: [] },
    { id: "interest", name: "대출 이자", category: "other" as const, unitPrice: String(input.interest), quantity: 1, discounts: [] },
    { id: "fee", name: "대출 수수료", category: "other" as const, unitPrice: String(input.fee), quantity: 1, discounts: [] },
  ].filter(item => item.unitPrice !== "0");
  return expenseSchema.parse({
    ...newExpense(input.date), title: `${loan.name} · 원리금 납입`, category: "mixed", paymentKind: "account",
    assetId: account.id, paymentMethod: account.name, paidAmount: String(input.principal + input.interest + input.fee),
    time: input.time, useTime: input.time, useTimeFollowsPayment: true, items, memo: input.memo,
    id, revision: (previous?.revision ?? 0) + 1, createdAt: previous?.createdAt ?? now, updatedAt: now,
    loanPayment: { loanId: loan.id, scheduleKey: loanScheduleKey(row), dueDate: row.dueDate, installment: row.installment, principal: input.principal, interest: input.interest, fee: input.fee },
  });
}

export function loansWithPayments(loans: LoanSample[], expenses: Expense[], asOf = todayInSeoul()): LoanSample[] {
  return loans.map(loan => {
    const linked = expenses.filter(expense => expense.loanPayment?.loanId === loan.id);
    if (!linked.length) return loan;
    const payments: LoanRepayment[] = linked.map(expense => ({
      id: expense.id, expenseId: expense.id, scheduleKey: expense.loanPayment!.scheduleKey,
      scheduledDueDate: expense.loanPayment!.dueDate, installment: expense.loanPayment!.installment,
      date: expense.paymentDate, time: expense.time, principal: expense.loanPayment!.principal,
      interest: expense.loanPayment!.interest, fee: expense.loanPayment!.fee,
      total: Number(expense.paidAmount), principalAfter: null, note: expense.memo,
    }));
    const result = { ...loan, repayments: [...loan.repayments, ...payments] };
    const principal = payments.filter(p => p.date > loan.informationDate && p.date <= asOf).reduce((sum, p) => sum + p.principal, 0);
    result.recordedRemainingPrincipal = loan.remainingPrincipal - principal;
    const anchor = loan.nextPayment?.date ?? loan.informationDate;
    const next = loan.schedule.filter(row => row.dueDate !== null && row.dueDate >= anchor && !scheduleRepayment(result, row)).sort((a, b) => a.dueDate!.localeCompare(b.dueDate!))[0];
    result.nextPayment = next ? { date: next.dueDate!, installment: next.installment, total: next.total } : null;
    return result;
  });
}

export function validateLoanPayments(loans: LoanSample[], expenses: Expense[]) {
  const seen = new Set<string>();
  for (const expense of expenses) {
    const link = expense.loanPayment;
    if (!link) continue;
    const loan = loans.find(row => row.id === link.loanId);
    const row = loan?.schedule.find(row => loanScheduleKey(row) === link.scheduleKey);
    if (!loan || !row) throw new Error("연결된 대출 상환일정을 찾을 수 없어요.");
    const key = JSON.stringify([link.loanId, link.scheduleKey]);
    if (seen.has(key) || scheduleRepayment(loan, row)) throw new Error("이미 납입한 상환일정이에요. 기존 납입 기록을 확인해 주세요.");
    seen.add(key);
  }
  for (const loan of loans) {
    const paid = expenses.filter(e => e.loanPayment?.loanId === loan.id && e.paymentDate > loan.informationDate).reduce((sum, e) => sum + e.loanPayment!.principal, 0);
    if (paid > loan.remainingPrincipal) throw new Error("기준일 이후 상환 원금이 확인 잔액을 초과해요.");
  }
}
