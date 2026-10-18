"use client";
import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Button } from "./ui/button";
import { DemoNotice, LedgerState } from "./ledger-state";
import { ExpenseForm } from "./expense-form";
import { ReceiptSummary } from "./receipt-summary";
import { useExpenses } from "@/lib/use-expenses";
import { categories, formatMoney, formatMinor, ownMinor, ownKrw, toMinor } from "@/lib/expense";
import { parseDateQuery } from "@/lib/date";

export function ExpenseView({ id, edit = false }: { id: string; edit?: boolean }) {
  const { data, error, mutate } = useExpenses();
  const query = useSearchParams();
  if (!data) return <LedgerState error={error} retry={() => { void mutate(); }} />;
  const item = data.find((entry) => entry.id === id);
  if (!item) return <div className="book-sheet rounded-3xl bg-card p-10"><h1 className="text-xl font-bold">거래를 찾을 수 없어요</h1><Link className="mt-5 block text-primary" href="/">일일 내역으로</Link></div>;
  if (edit) return <ExpenseForm key={id} date={item.useDate} existing={item} />;
  const category = categories[item.category];
  const back = parseDateQuery(query.get("from")) ?? (item.useKind === "period" ? item.paymentDate : item.useDate);
  const krw = ownKrw(item);
  return <>
    <header className="mb-6 flex items-center justify-between gap-3"><Link className="text-sm text-muted-foreground hover:text-primary" href={`/?date=${back}`}>← 일일 내역으로</Link><Button asChild variant="secondary"><Link href={`/transactions/${id}/edit`}>수정하기</Link></Button></header>
    {query.get("saved") === "1" ? <p role="status" className="mb-4 rounded-xl bg-secondary px-5 py-3 text-sm text-primary">저장했어요. 내역과 소비 합계에 반영했어요.</p> : null}
    <article className="book-sheet overflow-hidden rounded-3xl bg-card">
      <header className="daily-summary flex items-center gap-5 p-6 sm:p-8"><Image src={category.image} alt="" width={96} height={96} className="h-20 w-20 object-contain" /><div className="min-w-0"><p className="text-xs text-primary">{category.label} · {item.useKind === "period" ? "기간형 이용" : "일회성 이용"}</p><h1 className="mt-2 break-words text-2xl font-bold sm:text-3xl">{item.title}</h1><p className="mt-3 text-sm text-muted-foreground">{item.paymentDate} · {item.time ?? "시각 미확인"}</p></div></header>
      <div className="space-y-8 p-6 sm:p-8">
        <dl className="grid gap-6 sm:grid-cols-2"><div><dt className="text-sm text-muted-foreground">전체 결제</dt><dd className="mt-2 text-3xl font-semibold">{formatMoney(item.paidAmount, item.currency)}</dd></div><div><dt className="text-sm text-primary">내 소비</dt><dd className="mt-2 text-3xl font-bold text-primary">{formatMinor(ownMinor(item), item.currency)}</dd>{item.currency !== "KRW" ? <p className="mt-2 text-sm text-muted-foreground">{krw === null ? "원화 미확정 · 합계에서 분리" : `원화 소비 ${formatMinor(krw, "KRW")}`}</p> : null}</div></dl>
        <dl className="grid gap-5 rounded-2xl bg-background/70 p-5 text-sm sm:grid-cols-2"><div><dt className="mb-1 text-xs text-muted-foreground">결제수단</dt><dd>{item.paymentMethod}</dd></div><div><dt className="mb-1 text-xs text-muted-foreground">결제·승인일</dt><dd>{item.paymentDate} · {item.time ?? "시각 미확인"}</dd></div><div><dt className="mb-1 text-xs text-muted-foreground">이용일·이용기간</dt><dd>{item.useDate} · {item.useTime ?? "시각 미확인"}{item.useKind === "period" ? ` ~ ${item.useEnd}` : ""}</dd></div><div><dt className="mb-1 text-xs text-muted-foreground">소비 반영</dt><dd>{item.useKind === "period" ? item.allocation === "annual" ? "시작월부터 12개월 배분" : "시작월 정기지출" : "이용일의 일일 소비"}</dd></div></dl>
        <section><h2 className="mb-4 text-lg font-semibold">상품과 명세</h2>{!item.items.length ? <p className="mb-4 text-sm text-muted-foreground">아직 상품 명세가 없어요. 총액만 기록한 거래예요.</p> : <ul className="mb-5 space-y-4">{item.items.map((line) => <li key={line.id} className="rounded-xl bg-background/60 p-4"><div className="flex justify-between gap-4"><div className="min-w-0"><p className="break-words font-medium">{line.name}</p><p className="mt-1 text-xs text-muted-foreground tabular-nums">단가 {formatMoney(line.unitPrice, item.receiptCurrency)} × {line.quantity}</p></div><span className="shrink-0 tabular-nums">{formatMinor((toMinor(line.unitPrice, item.receiptCurrency) ?? 0) * line.quantity, item.receiptCurrency)}</span></div>{line.discounts.map((discount) => <p key={discount.id} className="mt-2 flex justify-between gap-3 text-sm text-primary"><span>↳ {discount.name}</span><span>−{formatMoney(discount.amount, item.receiptCurrency)}</span></p>)}</li>)}</ul>}{item.adjustments.map((line) => <p key={line.id} className="mb-3 flex justify-between gap-4 px-4 text-sm"><span>{line.name}</span><span>{line.kind === "discount" ? "−" : "+"}{formatMoney(line.amount, item.receiptCurrency)}</span></p>)}<ReceiptSummary expense={item} /></section>
        {item.memo ? <section><h2 className="mb-3 font-semibold">메모</h2><p className="whitespace-pre-wrap break-words text-sm leading-7 text-muted-foreground">{item.memo}</p></section> : null}
        <Link className="inline-block text-sm font-medium text-primary" href={`/month?month=${item.useDate.slice(0, 7)}`}>이용월의 소비 살펴보기 →</Link>
      </div>
    </article><DemoNotice />
  </>;
}
