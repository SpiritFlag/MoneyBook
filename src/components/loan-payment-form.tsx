"use client";
import Link from "next/link";
import { useRef, useState, type FormEvent } from "react";
import { useSWRConfig } from "swr";
import { loanDate, loanWon, type LoanSample, type LoanScheduleRow } from "@/lib/loan";
import { loanPaymentInputSchema, loanScheduleKey, loanScheduleBasis } from "@/lib/loan-payment";
import { todayInSeoul } from "@/lib/date";
import { useAssets } from "@/lib/use-assets";
import { useUnsavedChanges } from "@/lib/use-unsaved-changes";
import type { Expense } from "@/lib/expense";
import { Field } from "./form-fields";
import { TimeInput } from "./time-input";
import { Button } from "./ui/button";
import { LedgerState } from "./ledger-state";

export function LoanPaymentForm({ loan, row, existing, onClose, onSaved }: { loan: LoanSample; row: LoanScheduleRow; existing?: Expense; onClose: () => void; onSaved: () => void }) {
  const assets = useAssets();
  const { mutate } = useSWRConfig();
  const id = useRef<string | null>(existing?.id ?? null);
  const [date, setDate] = useState(existing?.paymentDate ?? row.dueDate ?? todayInSeoul());
  const [time, setTime] = useState(existing?.time ?? null);
  const [account, setAccount] = useState(existing?.assetId ?? "");
  const [principal, setPrincipal] = useState(String(existing?.loanPayment?.principal ?? row.principal));
  const [interest, setInterest] = useState(String(existing?.loanPayment?.interest ?? row.interest));
  const [fee, setFee] = useState(String(existing?.loanPayment?.fee ?? row.fee));
  const [memo, setMemo] = useState(existing?.memo ?? "");
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [dirty, setDirty] = useState(false);
  useUnsavedChanges(dirty && !busy);
  const total = Number(principal) + Number(interest) + Number(fee);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    const parsed = loanPaymentInputSchema.safeParse({ loanId: loan.id, scheduleKey: loanScheduleKey(row), scheduleBasis: loanScheduleBasis(row), date, time, assetId: account, principal: principal === "" ? NaN : Number(principal), interest: interest === "" ? NaN : Number(interest), fee: fee === "" ? NaN : Number(fee), memo });
    if (!parsed.success) { setError(parsed.error.issues[0].message); return; }
    setBusy(true); setError("");
    id.current ??= crypto.randomUUID();
    try {
      const response = await fetch("/api/loans/repayments", { method: existing ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: id.current, revision: existing?.revision, payment: parsed.data }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message ?? "납입을 저장하지 못했어요.");
      setDirty(false);
      await mutate(key => typeof key === "string" && (key.startsWith("/api/loans") || ["/api/expenses", "/api/operations", "/api/trash"].includes(key)));
      onSaved();
    } catch (error) { setError(error instanceof Error ? error.message : "납입을 저장하지 못했어요."); }
    finally { setBusy(false); }
  }
  if (!assets.data || assets.error) return <LedgerState error={assets.error} retry={() => { void assets.mutate(); }} />;
  const accounts = assets.data.filter(asset => asset.kind === "account" && asset.currency === "KRW");
  return <form onSubmit={submit} onChange={() => setDirty(true)} className="book-sheet rounded-3xl bg-card p-6 sm:p-8">
    <p className="text-sm text-primary">{loan.name}</p><h1 className="mt-2 text-2xl font-semibold">원리금 납입 {existing ? "수정" : "기록"}</h1>
    <div className="my-6 rounded-2xl bg-secondary/50 p-4 text-sm leading-7"><p className="font-medium">{row.displayLabel ?? (row.installment === null ? "상환 일정" : `${row.installment}회차`)} · 예정일 {row.dueDate ? loanDate(row.dueDate) : "미확인"}</p><p>예정 원금 {loanWon(row.principal)} · 이자 {loanWon(row.interest)}{row.fee ? ` · 수수료 ${loanWon(row.fee)}` : ""}</p><p className="mt-1 text-xs text-muted-foreground">예정일과 예정액은 보존해요. 아래에는 실제 출금 내역을 입력해 주세요.</p></div>
    <fieldset disabled={busy} className="grid gap-5 sm:grid-cols-2">
      <Field label="실제 출금일"><input required type="date" className="form-control" value={date} onChange={event => setDate(event.target.value)} /></Field>
      <Field label="출금 시각" hint="모르면 비워 두세요."><TimeInput value={time} onChange={value => { setTime(value); setDirty(true); }} /></Field>
      <Field label="출금 계좌" className="sm:col-span-2"><select required className="form-control" value={account} onChange={event => setAccount(event.target.value)}><option value="">원화 계좌 선택</option>{accounts.map(asset => <option key={asset.id} value={asset.id}>{asset.name}</option>)}</select></Field>
      {!accounts.length ? <p className="text-sm sm:col-span-2">먼저 <Link href="/assets/new" className="text-primary underline">원화 계좌를 등록</Link>해 주세요.</p> : null}
      <Field label="상환 원금"><input required type="number" min="0" max="999999999999" step="1" className="form-control" value={principal} onChange={event => setPrincipal(event.target.value)} /></Field>
      <Field label="이자"><input required type="number" min="0" max="999999999999" step="1" className="form-control" value={interest} onChange={event => setInterest(event.target.value)} /></Field>
      <Field label="수수료"><input required type="number" min="0" max="999999999999" step="1" className="form-control" value={fee} onChange={event => setFee(event.target.value)} /></Field>
      <Field label="메모" className="sm:col-span-2"><textarea maxLength={2000} className="form-control" value={memo} onChange={event => setMemo(event.target.value)} /></Field>
    </fieldset>
    <div aria-live="polite" className="my-6 rounded-2xl bg-background p-5 text-sm leading-7"><p className="font-semibold">실제 출금 {Number.isFinite(total) ? loanWon(total) : "금액 확인 필요"}</p><p>소비 반영 · 이자와 수수료 {Number.isFinite(Number(interest) + Number(fee)) ? loanWon(Number(interest) + Number(fee)) : "금액 확인 필요"}</p><p className="mt-2 text-xs text-muted-foreground">원금은 소비에서 제외해요. 확인 기준일({loanDate(loan.informationDate)}) 이전·당일 납입은 확인 잔액에서 다시 빼지 않아요. 같은 출금을 일반 지출에 따로 입력하지 마세요.</p></div>
    {error ? <p role="alert" className="mb-4 text-sm text-red-700">{error}</p> : null}
    <div className="flex gap-3"><Button disabled={busy || !accounts.length} type="submit">{busy ? "저장 중…" : "납입 저장"}</Button><Button disabled={busy} variant="secondary" type="button" onClick={() => { if (!dirty || window.confirm("저장하지 않은 입력을 버리고 돌아갈까요?")) onClose(); }}>돌아가기</Button></div>
  </form>;
}
