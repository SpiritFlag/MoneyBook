"use client";
import Link from "next/link";
import Image from "next/image";
import { useSearchParams } from "next/navigation";
import useSWR from "swr";
import { ChevronLeft, ChevronRight, RefreshCw, Sparkles } from "lucide-react";
import type { BuddyReviewData } from "@/lib/buddy-review";
import { categories, formatMinor, formatMoney } from "@/lib/expense";
import { expenseHref } from "@/lib/operations";
import { LedgerState } from "./ledger-state";
import { Button } from "./ui/button";

const timestamp = (value: string) => new Date(value).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "long", day: "numeric", hour: "numeric", minute: "2-digit", hour12: false });
async function fetchReviews(url: string): Promise<BuddyReviewData> {
  const response = await fetch(url, { cache: "no-store" });
  const body = await response.json();
  if (!response.ok) throw new Error(body.message ?? "버디의 평가를 불러오지 못했어요.");
  return body;
}
export function BuddyReviewContent({ data }: { data: BuddyReviewData }) {
  return <>
    <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
      <section className="book-sheet rounded-2xl bg-card p-5"><p className="text-xs text-muted-foreground">이번 달 지출</p><p className="mt-3 text-2xl font-bold text-primary">{data.expenses.length}<span className="ml-1 text-sm font-normal">건</span></p><p className="mt-2 text-xs text-muted-foreground">월간 소비 기준</p></section>
      <section className="book-sheet rounded-2xl bg-card p-5"><p className="text-xs text-muted-foreground">버디가 돌아본 지출</p><p className="mt-3 text-2xl font-bold text-primary">{data.reviewedCount}<span className="ml-1 text-sm font-normal">/ {data.expenses.length}건</span></p><p className="mt-2 text-xs text-muted-foreground">태그 또는 멘트가 있는 기록</p></section>
      <section className="book-sheet col-span-2 rounded-2xl bg-card p-5 sm:col-span-1"><p className="text-xs text-muted-foreground">이번 달 확정 소비</p><p className="mt-3 break-words text-2xl font-bold text-primary tabular-nums">{formatMinor(data.totalKrw, "KRW")}</p><p className="mt-2 text-xs text-muted-foreground">{data.pendingCount ? `원화 미확정 ${data.pendingCount}건 별도` : "취소·보험금·기간 배분 반영"}</p></section>
    </div>
    <section aria-label="월 전체 평가" className="book-sheet mb-7 rounded-3xl bg-primary/5 p-6 sm:p-8">
      <div className="mb-5 flex items-center gap-3"><Image src="/moneybook-mascot.png" alt="" width={56} height={56} className="rounded-2xl" /><div><p className="text-[10px] tracking-widest text-muted-foreground">BUDDY’S MONTHLY NOTE</p><h2 className="mt-1 text-lg font-semibold">한 달을 돌아보며</h2></div><Sparkles className="ml-auto shrink-0 text-primary/60" size={21} /></div>
      {data.summary ? <>
        <p className="whitespace-pre-wrap break-words text-sm leading-8">{data.summary.comment || "월 전체 평가가 비워져 있어요."}</p>
        <div className="mt-6 space-y-2 border-t border-primary/10 pt-5 text-xs leading-6"><p className="font-semibold">거래 확인 기준 · {timestamp(data.summary.reviewedThrough)}까지</p><p className="text-muted-foreground">평가 작성 · {timestamp(data.summary.generatedAt)}</p><p className="text-muted-foreground">기준시각에 조회한 이 달의 거래를 보고 작성한 평가예요.</p></div>
        {data.summary.state === "stale" ? <p role="status" className="mt-4 text-xs leading-6 text-amber-800">평가 이후 거래가 변경됐어요. ChatGPT에게 다시 돌아봐 달라고 해 보세요.</p> : null}
      </> : <><p className="text-sm">아직 버디가 남긴 월 전체 평가가 없어요.</p><p className="mt-3 text-xs leading-6 text-muted-foreground">ChatGPT에게 “{Number(data.month.slice(5))}월 지출을 돌아보고 버디의 평가에 남겨줘”라고 말해 보세요.</p></>}
    </section>
    <section aria-label="월별 지출 평가" className="book-sheet overflow-hidden rounded-3xl bg-card">
      <header className="flex items-center justify-between gap-3 border-b border-border/60 p-6 sm:px-8"><div><h2 className="text-base font-semibold">지출 하나하나, 버디의 생각</h2><p className="mt-2 text-xs leading-6 text-muted-foreground">자유로운 태그와 한마디로 소비를 돌아봐요.</p></div><span className="shrink-0 text-xs text-muted-foreground">{data.expenses.length}건</span></header>
      {data.expenses.length ? <ul className="divide-y divide-border/60">{data.expenses.map(entry => <li key={entry.id} className="p-5 sm:p-7">
        <Link href={expenseHref(entry.id)} className="transaction-link flex items-start justify-between gap-4 rounded-xl p-1"><div className="min-w-0"><p className="text-xs text-muted-foreground">{entry.expense.useDate} · {categories[entry.expense.category].label}{entry.expense.useKind === "period" ? " · 정기지출" : ""}</p><h3 className="mt-2 break-words text-sm font-semibold">{entry.expense.title}</h3><p className="mt-2 text-xs text-muted-foreground">{entry.expense.paymentMethod}</p></div><div className="max-w-[48%] shrink-0 text-right"><p className="break-words text-sm font-semibold tabular-nums">{entry.amountKrw === null ? "원화 미확정" : formatMinor(entry.amountKrw ?? 0, "KRW")}</p>{entry.expense.currency !== "KRW" ? <p className="mt-2 break-words text-xs text-muted-foreground">원결제 {formatMoney(entry.expense.paidAmount, entry.expense.currency, data.gameCurrencies)}</p> : null}</div></Link>
        {entry.review && (entry.review.tags.length > 0 || entry.review.comment) ? <div className="mt-4 rounded-2xl bg-primary/5 p-4 sm:p-5">
          {entry.review.tags.length ? <div aria-label="평가 태그" className="mb-3 flex flex-wrap gap-2">{entry.review.tags.map(tag => <span key={tag} className="max-w-full rounded-full border border-primary/10 bg-primary/5 px-3 py-1 text-xs break-words text-primary">{tag}</span>)}</div> : null}
          {entry.review.comment ? <p className="whitespace-pre-wrap break-words text-sm leading-7">{entry.review.comment}</p> : null}
          <p className="mt-3 text-[11px] text-muted-foreground">평가 작성 · {timestamp(entry.review.generatedAt)}</p>
          {entry.review.state === "stale" ? <p role="status" className="mt-3 text-xs text-amber-800">이 지출이 평가 이후 변경됐어요.</p> : null}
        </div> : <p className="mt-4 px-1 text-xs text-muted-foreground">버디의 평가를 기다리고 있어요.</p>}
      </li>)}</ul> : <p className="p-12 text-center text-sm text-muted-foreground">이 달에는 지출 기록이 없어요.</p>}
      <footer className="border-t border-border/60 px-6 py-5 text-xs leading-6 text-muted-foreground">태그와 평가는 ChatGPT가 MCP로 남겨요. 웹에서는 저장된 평가를 읽을 수 있어요. 소비 금액은 기존 월간 소비와 같은 기준이에요.</footer>
    </section>
  </>;
}

export function BuddyReviews({ initialMonth }: { initialMonth: string }) {
  const query = useSearchParams(), raw = query.get("month") ?? "";
  const month = /^(19\d{2}|[2-9]\d{3})-(0[1-9]|1[0-2])$/.test(raw) ? raw : initialMonth;
  const { data, error, mutate, isValidating } = useSWR<BuddyReviewData>(`/api/buddy-reviews?month=${month}`, fetchReviews, { dedupingInterval: 15_000, errorRetryCount: 1 });
  function select(value: string) { if (/^(19\d{2}|[2-9]\d{3})-(0[1-9]|1[0-2])$/.test(value)) window.history.replaceState(null, "", `/buddy?month=${value}`); }
  function step(delta: number) { const [y, m] = month.split("-").map(Number), next = new Date(Date.UTC(y, m - 1 + delta, 1)); if (next.getUTCFullYear() >= 1900 && next.getUTCFullYear() <= 9999) select(next.toISOString().slice(0, 7)); }
  return <><header className="mb-7"><p className="mb-2 text-xs font-semibold tracking-widest text-primary">A MONTH WITH BUDDY</p><h1 className="text-3xl font-bold">버디의 평가</h1><p className="mt-3 text-sm leading-7 text-muted-foreground">버디와 돌아보는 한 달의 지출.</p></header>
    <div className="mb-6 flex items-center justify-between gap-2"><div className="flex min-w-0 items-center gap-1"><Button variant="ghost" size="icon" aria-label="이전 달" onClick={() => step(-1)}><ChevronLeft size={18} /></Button><input aria-label="평가 조회 월" type="month" min="1900-01" max="9999-12" className="form-control max-w-44" value={month} onChange={e => select(e.target.value)} /><Button variant="ghost" size="icon" aria-label="다음 달" onClick={() => step(1)}><ChevronRight size={18} /></Button></div><Button variant="ghost" className="shrink-0 gap-2 px-2 text-xs sm:px-4" disabled={isValidating} onClick={() => void mutate()}><RefreshCw size={14} />새로고침</Button></div>
    {data ? <>{error ? <p role="alert" className="mb-4 text-sm text-amber-800">최신 평가 확인에 실패했어요. 새로고침해 주세요.</p> : null}<BuddyReviewContent data={data} /></> : <LedgerState error={error} retry={() => void mutate()} />}
  </>;
}
