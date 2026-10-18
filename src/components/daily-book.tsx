"use client";

import { useSearchParams } from "next/navigation";
import { DateNavigator } from "@/components/date-navigator";
import { TransactionList } from "@/components/transaction-list";
import { Button } from "@/components/ui/button";
import { parseDateQuery } from "@/lib/date";
import Link from "next/link";
import { dailyExpenses, daySummary, formatMinor } from "@/lib/expense";
import { useBook } from "@/lib/use-operations";
import { consumptionRecords, operationExpenses, operationLabels } from "@/lib/operations";
import { useState } from "react";
import { DemoNotice, LedgerState } from "./ledger-state";

export function DailyBook({ initialDate }: { initialDate: string }) {
  const searchParams = useSearchParams();
  const date = parseDateQuery(searchParams.get("date")) ?? initialDate;
  // 선택한 날짜가 주소에 남으므로 상세에서 돌아오거나 새로고침해도 유지됩니다.
  function setDate(value: string) {
    const query = new URLSearchParams(searchParams.toString());
    query.set("date", value);
    window.history.replaceState(null, "", `/?${query.toString()}`);
  }
  const { data: book, error, retry } = useBook();
  const [showTransfers, setShowTransfers] = useState(false);
  const data = book ? [...book.expenses, ...operationExpenses(book.operations)] : undefined;
  const events = (book?.operations ?? []).filter((o) => o.kind !== "template" && o.kind !== "transit" && o.kind !== "toll" && (o.kind === "transfer" ? showTransfers && o.rows.some((r) => r.date === date) : o.kind === "statement" ? o.payment?.date === date : o.date === date));
  const transactions = dailyExpenses(data ?? [], date);
  const { total, pending } = daySummary(book ? consumptionRecords(book.expenses, book.operations) : [], date);

  return <>
    <header className="mb-7 flex items-start justify-between gap-4">
      <div><p className="mb-2 text-xs font-semibold tracking-widest text-primary">하루하루, 차곡차곡</p><h1 className="text-3xl font-bold tracking-tight">일일 내역</h1><p className="mt-3 text-sm text-muted-foreground">오늘 쓴 돈과 그 이야기를 살펴보세요.</p></div>
      <Button asChild><Link href={`/transactions/new?date=${date}`}>지출 기록</Link></Button>
    </header>
    <section aria-label="선택한 날짜의 내역" className="book-sheet rounded-3xl bg-card pb-0.5">
      <div className="daily-summary relative flex flex-wrap items-end justify-between gap-5 rounded-t-3xl px-5 py-7 sm:px-8 sm:py-8">
        <span aria-hidden="true" className="absolute top-0 left-8 h-1 w-10 rounded-b-full bg-primary/45" />
        <div className="min-w-0"><p className="mb-2 text-[11px] font-medium tracking-[0.16em] text-primary/80">나의 하루</p><DateNavigator date={date} onDateChange={setDate} /><p className="mt-2 text-sm text-muted-foreground">거래 기록 {transactions.length}건 · 이른 시각부터</p></div>
        <div className="ml-auto text-right" aria-live="polite" aria-atomic="true"><p className="mb-2 text-xs text-muted-foreground">하루 소비</p><p className="text-3xl font-bold tracking-tight text-primary tabular-nums sm:text-4xl">{data ? formatMinor(total, "KRW") : "—"}</p></div>
      </div>
      {!data ? <LedgerState error={error} retry={retry} /> : <TransactionList transactions={transactions} date={date} operations={book?.operations} />}
      {pending > 0 ? <p className="px-8 pb-3 text-sm text-amber-800">원화 미확정 {pending}건은 합계에서 분리했어요.</p> : null}
      <p className="mx-5 mb-5 rounded-xl bg-[#f7f5ed] px-4 py-3 text-xs leading-relaxed text-muted-foreground sm:mx-7">하루 소비는 본인 부담액 기준이에요. 함께 낸 거래는 전체 결제액을 따로 표시해요.</p>
    </section>
    <section className="mt-6 rounded-3xl bg-card p-5 sm:p-7"><div className="flex flex-wrap justify-between gap-3"><h2 className="font-semibold">입출금·정산 흐름</h2><label className="flex items-center gap-2 text-xs text-muted-foreground"><input type="checkbox" checked={showTransfers} onChange={(e) => setShowTransfers(e.target.checked)} />자산 이동도 보기</label></div>{events.length ? <ul className="mt-4 space-y-2">{events.map((o) => <li key={o.id}><Link href={`/records/${o.id}`} className="transaction-link flex flex-wrap justify-between gap-2 rounded-xl bg-background/60 p-4 text-sm"><span>{o.title}</span><span className="text-primary">{operationLabels[o.kind]} →</span></Link></li>)}</ul> : <p className="mt-4 text-sm text-muted-foreground">이날의 별도 금융 흐름이 없어요.</p>}</section>
    <aside className="mt-5 flex flex-wrap items-center justify-between gap-3 px-1 text-xs text-muted-foreground">
      <DemoNotice />
      <Button variant="ghost" size="sm" onClick={() => setDate("2026-10-18")}>예시 날짜 보기 · 10월 18일</Button>
    </aside>
  </>;
}
