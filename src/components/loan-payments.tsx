"use client";
import Link from "next/link";
import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { useExpenses } from "@/lib/use-expenses";
import { loanDate, loanWon, type LoanSample } from "@/lib/loan";
import { loanScheduleKey, scheduleRepayment } from "@/lib/loan-payment";
import { LoanPaymentForm } from "./loan-payment-form";
import { LedgerState } from "./ledger-state";
import { Button } from "./ui/button";
import { Field } from "./form-fields";

export function LoanPayments({ loan }: { loan: LoanSample }) {
  const expenses = useExpenses();
  const query = useSearchParams();
  const editing = query.get("payment");
  const selectedExpense = expenses.data?.find(expense => expense.id === editing && expense.loanPayment?.loanId === loan.id);
  const initial = loan.schedule.find(row => !scheduleRepayment(loan, row) && row.dueDate === loan.nextPayment?.date) ?? loan.schedule.find(row => !scheduleRepayment(loan, row));
  const [selected, setSelected] = useState(initial ? loanScheduleKey(initial) : "");
  const [open, setOpen] = useState(false), [saved, setSaved] = useState(false), [editingClosed, setEditingClosed] = useState(false);
  const row = loan.schedule.find(row => loanScheduleKey(row) === (selectedExpense && !editingClosed ? selectedExpense.loanPayment!.scheduleKey : selected));
  const payment = row ? scheduleRepayment(loan, row) : undefined;
  const existing = selectedExpense && !editingClosed ? selectedExpense : expenses.data?.find(expense => expense.id === payment?.expenseId);
  if (!expenses.data || expenses.error) return <LedgerState error={expenses.error} retry={() => { void expenses.mutate(); }} />;
  if ((open || (selectedExpense && !editingClosed)) && row) return <LoanPaymentForm key={existing?.id ?? loanScheduleKey(row)} loan={loan} row={row} existing={existing} onClose={() => { setOpen(false); setEditingClosed(true); }} onSaved={() => { setOpen(false); setEditingClosed(true); setSaved(true); }} />;
  return <div className="space-y-5">
    <div><h2 className="text-lg font-semibold">상환일정에서 원리금 납입 기록</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">등록한 일정의 예정액을 불러와요. 실제 출금일과 금액은 저장 전에 바꿀 수 있어요.</p></div>
    {saved ? <p role="status" className="rounded-xl bg-secondary p-4 text-sm text-primary">납입을 저장했어요. 대출 이력·계좌 출금·소비에 함께 반영했어요.</p> : null}
    {!loan.schedule.length ? <p className="rounded-2xl bg-background p-5 text-sm">등록한 상환일정이 없어요. 일정을 등록한 뒤 납입을 기록할 수 있어요.</p> : <>
      <Field label="납입할 상환일정"><select className="form-control" value={selected} onChange={event => { setSelected(event.target.value); setSaved(false); }}><option value="">일정 선택</option>{loan.schedule.map(row => <option key={loanScheduleKey(row)} value={loanScheduleKey(row)}>{row.dueDate ? loanDate(row.dueDate) : "예정일 미확인"} · {row.displayLabel ?? (row.installment === null ? "예정" : `${row.installment}회차`)} · {loanWon(row.total)}{scheduleRepayment(loan, row) ? " · 납입 기록 있음" : ""}</option>)}</select></Field>
      {row ? <div className="rounded-2xl bg-background p-5 text-sm leading-7"><p>예정일 {row.dueDate ? loanDate(row.dueDate) : "미확인"}</p><p>원금 {loanWon(row.principal)} · 이자 {loanWon(row.interest)} · 수수료 {loanWon(row.fee)}</p>{payment ? <div className="mt-3"><p className="text-primary">실제 납입 {loanDate(payment.date)} · {loanWon(payment.total)}</p>{existing ? <div className="mt-3 flex flex-wrap gap-3"><Button variant="secondary" onClick={() => { setEditingClosed(true); setOpen(true); }}>납입 수정</Button><Link className="self-center text-primary underline" href={`/transactions/${existing.id}`}>거래 상세·휴지통 이동 →</Link></div> : <p className="mt-2 text-xs text-muted-foreground">기존 대출 자료의 납부 이력이에요. 중복 출금 방지를 위해 새로 등록하지 않아요.</p>}</div> : <Button className="mt-4" onClick={() => { setEditingClosed(true); setOpen(true); setSaved(false); }}>예정액으로 납입 기록</Button>}</div> : null}
    </>}
    <p className="text-xs leading-6 text-muted-foreground">저장한 납입은 거래내역에서 한 번만 출금돼요. 원금은 소비에서 제외하고 이자·수수료는 기타 소비에 반영해요. 납부 이력 탭에서 전체 기록을 확인할 수 있어요.</p>
  </div>;
}
