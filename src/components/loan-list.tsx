import Link from "next/link";
import { ArrowLeft, ArrowUpRight, Landmark, HandCoins } from "lucide-react";
import { loanDate, loanWon, type LoanSample, type LoanSummary } from "@/lib/loan";

export function LoanList({ loans, personalSample = false, stored = false }: { loans: readonly (LoanSample | LoanSummary)[]; personalSample?: boolean; stored?: boolean }) {
  return <>
    <Link href="/assets" className="mb-6 inline-flex items-center gap-2 text-sm text-primary"><ArrowLeft size={16} />자산 현황</Link>
    <header className="mb-7"><p className="mb-2 text-xs font-semibold tracking-widest text-primary">갚아가는 기록</p><h1 className="text-3xl font-bold">대출 노트</h1><p className="mt-3 text-sm leading-6 text-muted-foreground">남은 원금과 금리, 앞으로의 일정과 납부한 내역을 한곳에 모아요.</p></header>
    <p className="mb-6 rounded-2xl bg-secondary/60 px-5 py-4 text-sm leading-6">{stored ? "로그인한 계정에 저장한 대출 노트예요." : personalSample ? "제공한 대출 자료로 만든 로컬 샘플이에요." : "가상 데이터로 만든 대출 샘플이에요."} 가계부 지출·은행 잔액에는 반영되지 않아요.</p>
    <div className="grid gap-5 xl:grid-cols-2">{loans.map((loan) => <Link key={loan.id} href={`/loans/${encodeURIComponent(loan.id)}`} className="transaction-link book-sheet block rounded-3xl bg-card p-6 sm:p-8">
      <div className="flex items-start justify-between gap-4"><div className="flex min-w-0 items-center gap-3"><span className="rounded-2xl bg-secondary p-3 text-primary">{loan.counterpartyType === "person" ? <HandCoins size={23} /> : <Landmark size={23} />}</span><div><p className="text-xs text-muted-foreground">{loan.institution} · {loan.counterpartyType === "person" ? "개인 차입" : "대출"}</p><h2 className="mt-1 break-words text-xl font-semibold">{loan.name}</h2></div></div><ArrowUpRight size={19} className="shrink-0 text-primary" /></div>
      <p className="mt-8 text-xs text-muted-foreground">남은 원금</p><p className="mt-2 break-words text-3xl font-semibold text-primary tabular-nums">{loanWon(loan.remainingPrincipal)}</p>
      <div className="mt-6 grid gap-5 sm:grid-cols-2"><div><p className="text-xs text-muted-foreground">현재 금리</p><p className="mt-1 font-medium tabular-nums">{loan.annualRate === null ? "미확인" : `연 ${loan.annualRate}%`}</p></div><div><p className="text-xs text-muted-foreground">다음 납부 · {loan.counterpartyType === "person" ? "계산표 기준" : "금융기관 안내"}</p><p className="mt-1 font-medium tabular-nums">{loan.nextPayment ? `${loanDate(loan.nextPayment.date)} · ${loanWon(loan.nextPayment.total)}` : "예정표 미등록"}</p></div></div>
      <p className="mt-7 text-xs text-muted-foreground">{loan.repaymentMethod} · 납부 기록 {"repaymentCount" in loan ? loan.repaymentCount : loan.repayments.length}건</p>
    </Link>)}</div>{loans.length === 0 ? <p className="book-sheet rounded-3xl bg-card p-10 text-center text-muted-foreground">아직 등록한 대출이 없어요.</p> : null}
  </>;
}
