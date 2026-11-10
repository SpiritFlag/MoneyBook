"use client";

import Link from "next/link";
import { ArrowUpRight, CheckCheck } from "lucide-react";
import { useBook } from "@/lib/use-operations";
import { useCurrencies } from "@/lib/use-currencies";
import { bookReview } from "@/lib/book-review";
import { LedgerState } from "./ledger-state";

export function ReviewBook() {
  const { data: book, error, retry } = useBook();
  const { formatMoney, formatMinor } = useCurrencies();
  if (!book || error) return <LedgerState error={error} retry={retry} />;
  const groups = bookReview(book.expenses, book.operations);
  const checking = groups.filter(group => group.state === "check").reduce((sum, group) => sum + group.items.length, 0);
  const waiting = groups.filter(group => group.state === "waiting").reduce((sum, group) => sum + group.items.length, 0);
  return <>
    <header className="mb-7"><p className="mb-2 text-xs font-semibold tracking-widest text-primary">기록의 다음 단계</p><h1 className="text-3xl font-bold tracking-tight">정리할 일</h1><p className="mt-3 text-sm text-muted-foreground">확인할 금액과 기다리는 입출금을 모았어요. 거래를 열어 이어서 정리하세요.</p></header>
    <div className="review-summary">
      <div><p className="text-sm text-muted-foreground">확인 필요</p><p className="mt-2 text-3xl font-semibold tabular-nums">{checking}<span className="ml-1 text-sm font-normal text-muted-foreground">항목</span></p></div>
      <div><p className="text-sm text-muted-foreground">입출금 대기</p><p className="mt-2 text-3xl font-semibold tabular-nums">{waiting}<span className="ml-1 text-sm font-normal text-muted-foreground">항목</span></p></div>
    </div>
    {checking + waiting === 0 ? <div className="rounded-2xl border border-border bg-card px-6 py-10 text-center"><CheckCheck className="mx-auto mb-3 text-primary" aria-hidden="true" /><h2 className="font-semibold">모아 볼 확인·대기 항목이 없어요</h2><p className="mt-2 text-sm text-muted-foreground">카드 명세서와 대출 일정은 아래에서 따로 확인할 수 있어요.</p></div> : null}
    {groups.filter(group => group.items.length > 0).map(group => <section key={group.id} className="review-group" aria-labelledby={`review-${group.id}`}>
      <header><div className="flex items-center justify-between gap-4"><h2 id={`review-${group.id}`} className="font-semibold">{group.title} <span className="ml-2 text-sm font-normal text-muted-foreground">{group.items.length}</span></h2><span className="text-xs text-muted-foreground">{group.state === "check" ? "확인 필요" : "대기 중"}</span></div><p className="mt-2 text-xs leading-6 text-muted-foreground">{group.description}</p></header>
      <ul>{group.items.map(item => <li key={item.id}><Link href={item.href} className="review-row"><div className="min-w-0"><p className="break-words text-sm font-medium">{item.title}</p><p className="mt-1 text-xs text-muted-foreground">{item.date}</p></div><div className="shrink-0 text-right"><p className="text-sm font-semibold tabular-nums">{typeof item.amount === "string" ? formatMoney(item.amount, item.currency) : formatMinor(item.amount, item.currency)}</p><p className="mt-1 flex items-center justify-end gap-1 text-xs text-primary">{item.action}<ArrowUpRight size={13} aria-hidden="true" /></p></div></Link></li>)}</ul>
    </section>)}
    <div className="review-shortcuts"><Link href="/cards">카드 승인·명세서 확인 →</Link><Link href="/loans/repayments">이번 달 원리금 납입 →</Link><Link href="/settlements">분담금·보험금 내역 →</Link></div>
    <p className="mt-5 text-xs leading-6 text-muted-foreground">한 거래가 여러 항목에 포함될 수 있어요. 명세가 없거나 일부 미상인 거래는 검산 오류로 분류하지 않아요. 실제 연체 여부나 보험금 지급 예정은 판단하지 않아요.</p>
  </>;
}
