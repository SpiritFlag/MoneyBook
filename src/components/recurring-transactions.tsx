"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useExpenses } from "@/lib/use-expenses";
import { recurringRows, shiftMonth, validMonth } from "@/lib/recurring";
import { useCurrencies } from "@/lib/use-currencies";
import { LedgerState } from "./ledger-state";
import { Button } from "./ui/button";

export function RecurringTransactions({ initialMonth }: { initialMonth: string }) {
  const [month, setMonth] = useState(initialMonth);
  const { data, error, mutate } = useExpenses();
  const { formatMoney } = useCurrencies();
  const router = useRouter();
  const rows = recurringRows(data ?? [], month);
  function select(next: string | null) {
    if (!next || !validMonth(next)) return;
    setMonth(next);
    router.replace(`/recurring?month=${next}`, { scroll: false });
  }
  return <>
    <header className="mb-7"><h1 className="text-3xl font-bold">반복 거래 관리</h1><p className="mt-3 text-sm leading-6 text-muted-foreground">매월 반복하는 기간형 결제를 결제월 기준으로 확인해요. 입력을 누르면 지난달의 상품·할인·메모까지 불러와 수정할 수 있어요.</p></header>
    <div className="mb-6 flex flex-wrap items-center gap-2"><Button variant="ghost" size="icon" aria-label="이전 달" disabled={!shiftMonth(month, -1)} onClick={() => select(shiftMonth(month, -1))}>‹</Button><label><span className="sr-only">조회 월</span><input type="month" min="1900-01" max="9999-12" className="form-control" value={month} onChange={e => select(e.target.value)} /></label><Button variant="ghost" size="icon" aria-label="다음 달" disabled={!shiftMonth(month, 1)} onClick={() => select(shiftMonth(month, 1))}>›</Button><Link href="/transactions/new" className="ml-auto text-sm font-medium text-primary">+ 지출 기록</Link></div>
    <p className="mb-4 text-sm text-muted-foreground">자동으로 거래를 추가하지 않아요. 입력 화면에서 확인하고 저장한 건만 장부에 반영돼요.</p>
    <p className="mb-3 text-xs text-muted-foreground sm:hidden">표를 좌우로 밀면 결제액·기록 상태·입력 버튼을 볼 수 있어요.</p>
    {!data || error ? <LedgerState error={error} retry={() => { void mutate(); }} /> : !rows.length ? <section className="book-sheet rounded-3xl bg-card p-8"><p>등록된 반복 거래가 없어요.</p><p className="mt-3 text-sm leading-6 text-muted-foreground">기존 지출을 수정하거나 새로 기록할 때 기간형 이용의 ‘매월 반복’을 체크해 주세요.</p></section> : <section aria-label="월별 반복 거래" className="book-sheet overflow-hidden rounded-3xl bg-card"><div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><caption className="sr-only">{month} 반복 거래와 기록 상태</caption><thead className="border-b bg-secondary/40 text-xs text-muted-foreground"><tr>{["거래명", "이용기간", "결제일", "결제액", "결제수단", "기록 상태", "관리"].map(label => <th scope="col" key={label} className="px-4 py-4 font-medium">{label}</th>)}</tr></thead><tbody>{rows.map(row => {
      const recorded = row.current[0];
      const shown = recorded ?? row.previous ?? row.latest;
      return <tr key={row.id} className="border-b border-border/60 last:border-0"><th scope="row" className="px-4 py-5 font-medium"><Link href={`/transactions/${shown.id}`} className="text-primary underline-offset-4 hover:underline">{shown.title}</Link>{!recorded ? <p className="mt-1 text-xs font-normal text-muted-foreground">{row.previous ? "지난달 내역" : `${shown.paymentDate.slice(0, 7)} 내역`}</p> : null}</th><td className="px-4 py-5 text-xs whitespace-nowrap">{shown.useDate}<br />~ {shown.useEnd}</td><td className="px-4 py-5 whitespace-nowrap">{shown.paymentDate}</td><td className="px-4 py-5 whitespace-nowrap tabular-nums">{formatMoney(shown.paidAmount, shown.currency)}</td><td className="px-4 py-5">{shown.paymentMethod}</td><td className="px-4 py-5 whitespace-nowrap">{recorded ? `기록 ${row.current.length}건` : "미기록"}</td><td className="px-4 py-5 whitespace-nowrap">{recorded ? <Link className="font-medium text-primary" href={`/transactions/${recorded.id}/edit`}>수정</Link> : row.previous ? <Link className="font-medium text-primary" href={`/transactions/new?recurring=${encodeURIComponent(row.previous.id)}&month=${month}`}>입력</Link> : <span className="text-xs text-muted-foreground">지난달 내역 없음</span>}</td></tr>;
    })}</tbody></table></div></section>}
    <p className="mt-4 text-xs leading-6 text-muted-foreground">미기록 행의 날짜와 금액은 과거 기록이에요. 입력하면 날짜를 한 달 옮긴 초안이 열리며, 실제 결제일과 금액을 수정할 수 있어요. 기존 거래는 자동으로 반복 지정하지 않아요.</p>
  </>;
}
