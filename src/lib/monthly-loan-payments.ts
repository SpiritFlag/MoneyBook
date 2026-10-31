import { z } from "zod";
import { parseDateQuery } from "./date";
import type { Expense } from "./expense";
import type { LoanSample } from "./loan";
import { loansWithPayments, loanScheduleKey, scheduleRepayment } from "./loan-payment";

export const loanPaymentMonthSchema = z.string().regex(/^\d{4}-\d{2}$/).refine(value => parseDateQuery(`${value}-01`) !== null, "조회 월을 확인해 주세요.");
export function monthlyLoanPayments(loans: LoanSample[], expenses: Expense[], month: string) {
  loanPaymentMonthSchema.parse(month);
  const effective = loansWithPayments(loans, expenses);
  const rows = effective.flatMap(loan => loan.schedule.filter(schedule => schedule.dueDate?.startsWith(`${month}-`)).map(schedule => {
    const payment = scheduleRepayment(loan, schedule) ?? null;
    const existing = payment?.expenseId ? expenses.find(expense => expense.id === payment.expenseId) ?? null : null;
    return {
      id: JSON.stringify([loan.id, loanScheduleKey(schedule)]),
      loan: { id: loan.id, name: loan.name, institution: loan.institution, informationDate: loan.informationDate, startDate: loan.startDate, originalPrincipal: loan.originalPrincipal },
      schedule, payment, existing,
      status: existing ? "linked" as const : payment ? "legacy" as const : "pending" as const,
    };
  })).sort((a, b) => a.schedule.dueDate!.localeCompare(b.schedule.dueDate!) || a.loan.institution.localeCompare(b.loan.institution, "ko") || a.loan.name.localeCompare(b.loan.name, "ko") || a.id.localeCompare(b.id));
  const totals = rows.reduce((sum, row) => ({
    scheduled: sum.scheduled + row.schedule.total,
    principal: sum.principal + row.schedule.principal,
    interest: sum.interest + row.schedule.interest,
    fee: sum.fee + row.schedule.fee,
    paid: sum.paid + (row.payment?.total ?? 0),
    pending: sum.pending + (row.payment ? 0 : row.schedule.total),
    paidCount: sum.paidCount + (row.payment ? 1 : 0),
  }), { scheduled: 0, principal: 0, interest: 0, fee: 0, paid: 0, pending: 0, paidCount: 0 });
  return { month, rows, totals, unknownDateCount: loans.reduce((sum, loan) => sum + loan.schedule.filter(row => row.dueDate === null).length, 0) };
}
export type MonthlyLoanPayments = ReturnType<typeof monthlyLoanPayments>;
export type MonthlyLoanPaymentRow = MonthlyLoanPayments["rows"][number];
