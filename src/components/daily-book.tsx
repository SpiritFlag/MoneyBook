"use client";

import { useState } from "react";
import { DateNavigator } from "@/components/date-navigator";
import { TransactionList } from "@/components/transaction-list";
import { Button } from "@/components/ui/button";
import { displayDate } from "@/lib/date";
import { formatWon, getDailyTransactions, sumPersonalSpending } from "@/lib/demo-transactions";

export function DailyBook({ initialDate }: { initialDate: string }) {
  const [date, setDate] = useState(initialDate);
  const transactions = getDailyTransactions(date);
  const total = sumPersonalSpending(transactions);

  return <>
    <header className="mb-7 flex items-start justify-between gap-4">
      <div><p className="mb-2 text-xs font-semibold tracking-widest text-primary">하루하루, 차곡차곡</p><h1 className="text-3xl font-bold tracking-tight">일일 내역</h1><p className="mt-3 text-sm text-muted-foreground">오늘 쓴 돈과 그 이야기를 살펴보세요.</p></div>
      <span className="shrink-0 rounded-full border bg-card px-3 py-1.5 text-xs text-muted-foreground">가상 데이터</span>
    </header>
    <DateNavigator date={date} onDateChange={setDate} />
    <section aria-label="선택한 날짜의 내역" className="mt-6 overflow-hidden rounded-2xl border bg-card">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b bg-secondary/40 px-5 py-6 sm:px-7 sm:py-7">
        <div><h2 className="text-lg font-semibold">{displayDate(date)}</h2><p className="mt-2 text-sm text-muted-foreground">소비 내역 {transactions.length}건</p></div>
        <div className="text-right" aria-live="polite" aria-atomic="true"><p className="mb-1 text-xs text-muted-foreground">하루 소비</p><p className="text-3xl font-bold tracking-tight text-primary tabular-nums">{formatWon(total)}</p></div>
      </div>
      <TransactionList transactions={transactions} />
      <p className="border-t px-5 py-4 text-xs leading-relaxed text-muted-foreground sm:px-7">하루 소비는 본인 부담액 기준이에요. 함께 낸 거래는 전체 결제액을 따로 표시해요.</p>
    </section>
    <aside className="mt-5 flex flex-wrap items-center justify-between gap-3 px-1 text-xs text-muted-foreground">
      <p>지금은 가상 내역으로 둘러보는 중이에요. 실제 장부에 저장되지 않아요.</p>
      <Button variant="ghost" size="sm" onClick={() => setDate("2026-10-18")}>예시 날짜 보기 · 10월 18일</Button>
    </aside>
  </>;
}
