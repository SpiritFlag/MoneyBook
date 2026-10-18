"use client";

import { useState } from "react";
import { DateNavigator } from "@/components/date-navigator";
import { TransactionList } from "@/components/transaction-list";
import { Button } from "@/components/ui/button";
import { formatWon, getDailyTransactions, sumPersonalSpending } from "@/lib/demo-transactions";

export function DailyBook({ initialDate }: { initialDate: string }) {
  const [date, setDate] = useState(initialDate);
  const transactions = getDailyTransactions(date);
  const total = sumPersonalSpending(transactions);

  return <>
    <header className="mb-7 flex items-start justify-between gap-4">
      <div><p className="mb-2 text-xs font-semibold tracking-widest text-primary">하루하루, 차곡차곡</p><h1 className="text-3xl font-bold tracking-tight">일일 내역</h1><p className="mt-3 text-sm text-muted-foreground">오늘 쓴 돈과 그 이야기를 살펴보세요.</p></div>
      <span className="shrink-0 rounded-full bg-[#eee6d5] px-3 py-1.5 text-xs text-[#776442]">가상 데이터</span>
    </header>
    <section aria-label="선택한 날짜의 내역" className="book-sheet rounded-3xl bg-card pb-0.5">
      <div className="daily-summary relative flex flex-wrap items-end justify-between gap-5 rounded-t-3xl px-5 py-7 sm:px-8 sm:py-8">
        <span aria-hidden="true" className="absolute top-0 left-8 h-1 w-10 rounded-b-full bg-primary/45" />
        <div className="min-w-0"><p className="mb-2 text-[11px] font-medium tracking-[0.16em] text-primary/80">나의 하루</p><DateNavigator date={date} onDateChange={setDate} /><p className="mt-2 text-sm text-muted-foreground">소비 내역 {transactions.length}건</p></div>
        <div className="ml-auto text-right" aria-live="polite" aria-atomic="true"><p className="mb-2 text-xs text-muted-foreground">하루 소비</p><p className="text-3xl font-bold tracking-tight text-primary tabular-nums sm:text-4xl">{formatWon(total)}</p></div>
      </div>
      <TransactionList transactions={transactions} />
      <p className="mx-5 mb-5 rounded-xl bg-[#f7f5ed] px-4 py-3 text-xs leading-relaxed text-muted-foreground sm:mx-7">하루 소비는 본인 부담액 기준이에요. 함께 낸 거래는 전체 결제액을 따로 표시해요.</p>
    </section>
    <aside className="mt-5 flex flex-wrap items-center justify-between gap-3 px-1 text-xs text-muted-foreground">
      <p>지금은 가상 내역으로 둘러보는 중이에요. 실제 장부에 저장되지 않아요.</p>
      <Button variant="ghost" size="sm" onClick={() => setDate("2026-10-18")}>예시 날짜 보기 · 10월 18일</Button>
    </aside>
  </>;
}
