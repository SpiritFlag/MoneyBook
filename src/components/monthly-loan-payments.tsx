"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { loanDate, loanWon } from "@/lib/loan";
import { todayInSeoul } from "@/lib/date";
import { loanPaymentMonthSchema, type MonthlyLoanPayments } from "@/lib/monthly-loan-payments";
import { LoanNav } from "./loan-nav";
import { LoanPaymentForm } from "./loan-payment-form";
import { LedgerState } from "./ledger-state";
import { Button } from "./ui/button";

async function readMonthlyPayments(url: string): Promise<MonthlyLoanPayments> {
  const response = await fetch(url, { cache: "no-store" });
  const body = await response.json();
  if (!response.ok) throw new Error(body.message ?? "월별 납입 현황을 불러오지 못했어요.");
  return body;
}

export function MonthlyLoanPaymentBook({ initialMonth }: { initialMonth: string }) {
  const router = useRouter();
  const [month, setMonth] = useState(initialMonth);
  const [institution, setInstitution] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [selected, setSelected] = useState<string | null>(null);
  const [saved, setSaved] = useState("");
  const editor = useRef<HTMLDivElement>(null);
  const { data, error, mutate } = useSWR(`/api/loans/repayments?month=${month}`, readMonthlyPayments, { errorRetryCount: 2, focusThrottleInterval: 30_000 });
  useEffect(() => { if (selected) { editor.current?.focus({ preventScroll: true }); editor.current?.scrollIntoView({ block: "start" }); } }, [selected]);
  function selectMonth(value: string) {
    if (selected || !loanPaymentMonthSchema.safeParse(value).success) return;
    setMonth(value); setSaved(""); setInstitution("");
    router.replace(`/loans/repayments?month=${value}`, { scroll: false });
  }
  function stepMonth(delta: number) {
    const [year, number] = month.split("-").map(Number);
    const shifted = new Date(Date.UTC(year, number - 1 + delta, 1));
    if (shifted.getUTCFullYear() < 1900 || shifted.getUTCFullYear() > 9999) return;
    selectMonth(shifted.toISOString().slice(0, 7));
  }
  const institutions = [...new Set(data?.rows.map(row => row.loan.institution) ?? [])];
  const query = search.trim().toLocaleLowerCase();
  const visible = data?.rows.filter(row => (!institution || row.loan.institution === institution) && (status === "all" || (status === "pending" ? row.status === "pending" : row.status !== "pending")) && (!query || [row.loan.name, row.loan.institution, row.loan.startDate, String(row.loan.originalPrincipal), String(row.schedule.total), row.schedule.displayLabel ?? ""].some(value => value.toLocaleLowerCase().includes(query)))) ?? [];
  const editing = data?.rows.find(row => row.id === selected);
  return <>
    <header className="mb-7"><p className="mb-2 text-xs font-semibold tracking-widest text-primary">이번 달 갚을 돈을 한눈에</p><h1 className="text-3xl font-bold">원리금 납입</h1><p className="mt-3 text-sm leading-6 text-muted-foreground">여러 대출의 상환일정과 납입 상태를 한 표에서 비교하고 기록해요.</p></header>
    <LoanNav active="repayments" />
    <fieldset disabled={selected !== null} className="mb-6 space-y-4">
      <div className="flex flex-wrap items-center gap-2"><Button variant="secondary" size="icon" aria-label="이전 달" disabled={selected !== null || month === "1900-01"} onClick={() => stepMonth(-1)}><ChevronLeft size={18} /></Button><label><span className="sr-only">조회 월</span><input type="month" min="1900-01" max="9999-12" className="form-control" value={month} onChange={event => selectMonth(event.target.value)} /></label><Button variant="secondary" size="icon" aria-label="다음 달" disabled={selected !== null || month === "9999-12"} onClick={() => stepMonth(1)}><ChevronRight size={18} /></Button><Button variant="ghost" onClick={() => selectMonth(todayInSeoul().slice(0, 7))}>이번 달</Button></div>
      <div className="grid gap-3 sm:grid-cols-3"><label className="grid gap-2 text-sm"><span>기관</span><select className="form-control" value={institution} onChange={event => setInstitution(event.target.value)}><option value="">전체 기관</option>{institutions.map(name => <option key={name}>{name}</option>)}</select></label><label className="grid gap-2 text-sm"><span>납입 상태</span><select className="form-control" value={status} onChange={event => setStatus(event.target.value)}><option value="all">전체 상태</option><option value="pending">미기록</option><option value="paid">납입 기록 있음</option></select></label><label className="grid gap-2 text-sm"><span>대출·금액 찾기</span><input type="search" className="form-control" placeholder="이름, 실행일, 대출금, 예정액" value={search} onChange={event => setSearch(event.target.value)} /></label></div>
    </fieldset>
    {saved ? <p role="status" className="mb-5 rounded-xl bg-secondary p-4 text-sm text-primary">{saved}</p> : null}
    {!data || error ? <LedgerState error={error} retry={() => { void mutate(); }} /> : <>
      <dl aria-label="조회 월 전체 납입 현황" className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">{[
        ["예정 합계", loanWon(data.totals.scheduled), `${data.rows.length}건 · 예정일 기준`],
        ["납입 기록액", loanWon(data.totals.paid), `${data.totals.paidCount}건 · 실제 납입액`],
        ["남은 예정액", loanWon(data.totals.pending), `${data.rows.length - data.totals.paidCount}건 미기록`],
        ["기록 현황", `${data.totals.paidCount} / ${data.rows.length}건`, "조회 월 전체 기준"],
      ].map(([label, amount, hint]) => <div key={label} className="book-sheet min-w-0 rounded-2xl bg-card p-4 sm:p-5"><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-2 break-words text-xl font-semibold text-primary tabular-nums">{amount}</dd><dd className="mt-2 text-xs text-muted-foreground">{hint}</dd></div>)}</dl>
      <p className="mb-4 text-xs leading-6 text-muted-foreground">{month.replace("-", "년 ")}월 예정 원금 {loanWon(data.totals.principal)} · 이자 {loanWon(data.totals.interest)} · 수수료 {loanWon(data.totals.fee)}. 실제 출금일이 다른 달이어도 원래 예정월에 표시해요. 미기록은 장부에 납입 기록이 없다는 뜻이에요.</p>
      <p className="mb-3 text-xs text-muted-foreground sm:hidden">표를 좌우로 밀면 금액·납입 상태·입력 버튼을 볼 수 있어요.</p>
      <section aria-label="월별 상환일정과 납입 상태" className="book-sheet overflow-hidden rounded-3xl bg-card">
        <div className="flex flex-wrap justify-between gap-2 border-b border-border px-5 py-4"><h2 className="font-semibold">상환일정별 납입</h2><span className="text-sm text-muted-foreground">표시 {visible.length}건 / 전체 {data.rows.length}건</span></div>
        {visible.length ? <div className="overflow-x-auto"><table className="w-full min-w-[1080px] text-sm"><thead className="bg-secondary/40 text-xs text-muted-foreground"><tr>{["대출", "예정일·회차", "예정 원금", "예정 이자·수수료", "예정 합계", "상태", "실제 출금·납입", "입력·수정"].map(label => <th key={label} scope="col" className="whitespace-nowrap px-4 py-4 text-left font-medium">{label}</th>)}</tr></thead><tbody>{visible.map(row => <tr key={row.id} className={`border-t border-border/60 ${row.id === selected ? "bg-secondary/40" : "hover:bg-secondary/15"}`}>
          <th scope="row" className="min-w-56 px-4 py-5 text-left align-top font-normal"><span className="text-xs text-muted-foreground">{row.loan.institution}</span><Link href={`/loans/${encodeURIComponent(row.loan.id)}`} className="mt-1 block font-semibold text-primary hover:underline">{row.loan.name}</Link><span className="mt-2 block text-xs leading-5 text-muted-foreground">실행 {loanDate(row.loan.startDate)}<br />최초 {loanWon(row.loan.originalPrincipal)}</span></th>
          <td className="px-4 py-5 align-top"><span className="whitespace-nowrap">{loanDate(row.schedule.dueDate!)}</span><span className="mt-1 block text-xs text-muted-foreground">{row.schedule.displayLabel ?? (row.schedule.installment === null ? "회차 미확인" : `${row.schedule.installment}회차`)}</span></td>
          <td className="whitespace-nowrap px-4 py-5 align-top tabular-nums">{loanWon(row.schedule.principal)}</td><td className="whitespace-nowrap px-4 py-5 align-top tabular-nums">{loanWon(row.schedule.interest)}{row.schedule.fee ? <span className="mt-1 block text-xs text-muted-foreground">수수료 {loanWon(row.schedule.fee)}</span> : null}</td><td className="whitespace-nowrap px-4 py-5 align-top font-semibold tabular-nums">{loanWon(row.schedule.total)}</td>
          <td className="px-4 py-5 align-top"><span className={`inline-block whitespace-nowrap rounded-full px-3 py-1 text-xs ${row.status === "pending" ? "bg-background text-muted-foreground" : "bg-secondary text-primary"}`}>{row.status === "pending" ? "미기록" : row.status === "legacy" ? "기존 납부 이력" : "납입 기록됨"}</span></td>
          <td className="px-4 py-5 align-top">{row.payment ? <><span className="whitespace-nowrap tabular-nums">{loanWon(row.payment.total)}</span><span className="mt-1 block whitespace-nowrap text-xs text-muted-foreground">{loanDate(row.payment.date)}</span>{row.existing ? <Link className="mt-2 block text-xs text-primary underline" href={`/transactions/${row.existing.id}`}>출금 상세</Link> : <span className="mt-1 block text-xs text-muted-foreground">기존 자료 · 원장 미연동</span>}</> : "—"}</td>
          <td className="px-4 py-5 align-top">{row.status === "legacy" ? <Link href={`/loans/${encodeURIComponent(row.loan.id)}`} className="whitespace-nowrap text-xs text-primary underline">이력 보기</Link> : <Button disabled={selected !== null} variant="secondary" size="sm" aria-label={`${row.loan.name} ${row.schedule.dueDate} 납입 ${row.existing ? "수정" : "입력"}`} onClick={() => { setSelected(row.id); setSaved(""); }}>{row.existing ? "수정" : "입력"}</Button>}</td>
        </tr>)}</tbody></table></div> : <p className="p-10 text-center text-sm text-muted-foreground">{data.rows.length ? "선택한 조건에 맞는 일정이 없어요." : "이 달에 등록된 상환일정이 없어요."}</p>}
      </section>
      {data.unknownDateCount ? <p className="mt-4 text-xs text-muted-foreground">예정일을 모르는 일정 {data.unknownDateCount}건은 월별 표에서 제외했어요. 각 대출 상세에서 확인할 수 있어요.</p> : null}
      <p className="mt-3 text-xs leading-6 text-muted-foreground">기존 자료의 납부 이력은 중복 출금 없이 조회해요. 이 화면에서 새로 기록한 납입은 수정할 수 있고, 출금 상세에서 휴지통으로 옮길 수 있어요.</p>
      {editing && editing.status !== "legacy" ? <div ref={editor} tabIndex={-1} aria-label="선택한 납입 편집" className="mt-7 scroll-mt-6 outline-none"><LoanPaymentForm key={editing.existing?.id ?? editing.id} loan={editing.loan} row={editing.schedule} existing={editing.existing ?? undefined} onClose={() => setSelected(null)} onSaved={() => { setSelected(null); setSaved("납입을 저장했어요. 표의 현황과 계좌·대출 이력에 함께 반영했어요."); }} /></div> : null}
    </>}
  </>;
}
