"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useBook } from "@/lib/use-operations";
import { consumptionRecords, expenseHref } from "@/lib/operations";
import { monthAmount, formatMinor, categories } from "@/lib/expense";
import { DemoNotice, LedgerState } from "./ledger-state";
import { Button } from "./ui/button";
export function MonthlyBook({ initialMonth }: { initialMonth: string }) {
  const query = useSearchParams();
  const raw = query.get("month") ?? "";
  const month = /^(19\d{2}|[2-9]\d{3})-(0[1-9]|1[0-2])$/.test(raw) ? raw : initialMonth;
  const { data: book, error, retry } = useBook();
  const data = book ? consumptionRecords(book.expenses, book.operations) : undefined;
  function select(value: string) { if (/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) window.history.replaceState(null, "", `/month?month=${value}`); }
  function step(delta: number) { const [y, m] = month.split("-").map(Number); const date = new Date(Date.UTC(y, m - 1 + delta, 1)); if (date.getUTCFullYear() >= 1900 && date.getUTCFullYear() <= 9999) select(date.toISOString().slice(0, 7)); }
  const entries = (data ?? []).map((item) => ({ item, amount: monthAmount(item, month) })).filter((entry) => entry.amount !== undefined);
  const normal = entries.filter(({ item }) => item.useKind === "once").reduce((sum, entry) => sum + (entry.amount ?? 0), 0);
  const recurring = entries.filter(({ item }) => item.useKind === "period").reduce((sum, entry) => sum + (entry.amount ?? 0), 0);
  const pending = entries.filter((entry) => entry.amount === null).length;
  return <><header className="mb-7"><p className="mb-2 text-xs font-semibold tracking-widest text-primary">한 달의 소비를 한눈에</p><h1 className="text-3xl font-bold">월간 소비</h1><p className="mt-3 text-sm text-muted-foreground">일일 소비와 기간형 이용을 함께 살펴보세요.</p></header><section className="book-sheet overflow-hidden rounded-3xl bg-card"><div className="daily-summary p-6 sm:p-8"><div className="mb-6 flex items-center gap-2"><Button variant="ghost" size="icon" aria-label="이전 달" onClick={() => step(-1)}>‹</Button><label className="min-w-0"><span className="sr-only">조회 월</span><input type="month" min="1900-01" max="9999-12" className="form-control" value={month} onChange={(e) => select(e.target.value)} /></label><Button variant="ghost" size="icon" aria-label="다음 달" onClick={() => step(1)}>›</Button></div><p className="text-xs text-muted-foreground">확정된 내 소비</p><p className="mt-2 text-4xl font-bold text-primary tabular-nums">{data ? formatMinor(normal + recurring, "KRW") : "—"}</p><div className="mt-5 flex flex-wrap gap-x-8 gap-y-2 text-sm"><p>일일 소비 <strong>{formatMinor(normal, "KRW")}</strong></p><p>정기지출 <strong>{formatMinor(recurring, "KRW")}</strong></p></div>{pending ? <p className="mt-3 text-sm text-amber-800">원화 미확정 {pending}건 별도</p> : null}</div>{!data ? <LedgerState error={error} retry={retry} /> : entries.length ? <ul className="space-y-1 p-3">{entries.map(({ item, amount }) => <li key={item.id}><Link href={expenseHref(item.id)} className="transaction-link flex items-center justify-between gap-4 rounded-2xl p-4 sm:p-5"><div className="min-w-0"><p className="mb-1 text-xs text-muted-foreground">{categories[item.category].label} · {item.useKind === "period" ? item.allocation === "annual" ? "연간 결제 배분" : "정기지출" : item.useDate}</p><p className="break-words text-sm font-semibold">{item.title}</p></div><span className="shrink-0 text-sm font-semibold tabular-nums">{amount == null ? "원화 미확정" : formatMinor(amount, "KRW")}</span></Link></li>)}</ul> : <p className="p-12 text-center text-sm text-muted-foreground">이번 달에 반영할 소비가 없어요.</p>}<p className="px-7 pb-6 text-xs leading-6 text-muted-foreground">이용일 기준의 본인 부담액이에요. 기간형 결제는 일일 합계에서 제외하고 이곳에서 반영해요. 연간 결제는 시작월부터 12개월로 나누며 나머지는 첫 달에 더해요.</p></section><DemoNotice /></>;
}
