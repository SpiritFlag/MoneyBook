"use client";
import { useCurrencies } from "@/lib/use-currencies";
import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Button } from "./ui/button";
import { DemoNotice, LedgerState } from "./ledger-state";
import { ExpenseForm } from "./expense-form";
import { ExpenseReceipt } from "./expense-receipt";
import { useBook } from "@/lib/use-operations";
import { netConsumption, cancelled, sharedRemaining, insuranceRecovered, operationLabels } from "@/lib/operations";
import { dominantCategory, categories, ownMinor, consumptionMinor, hasLoanPrincipal } from "@/lib/expense";
import { bookDate, parseDateQuery } from "@/lib/date";

export function ExpenseView({ id, edit = false }: { id: string; edit?: boolean }) {
  const { currencyInfo, formatMoney, formatMinor } = useCurrencies();
  const { data: book, error, retry } = useBook();
  const query = useSearchParams();
  if (!book || error) return <LedgerState error={error} retry={retry} />;
  const item = book.expenses.find(entry => entry.id === id);
  if (!item) return <div className="book-sheet rounded-3xl bg-card p-10"><h1 className="text-xl font-bold">거래를 찾을 수 없어요</h1><Link className="mt-5 block text-primary" href="/">일일 내역으로</Link></div>;
  if (edit) return <ExpenseForm key={id} date={item.useDate} existing={item} />;
  const category = { ...categories[dominantCategory(item)], label: categories[item.category].label };
  const back = parseDateQuery(query.get("from")) ?? (item.useKind === "period" ? item.paymentDate : item.useDate);
  const krw = netConsumption(item, book.operations);
  const isCancelled = cancelled(id, book.operations);
  const recovered = insuranceRecovered(id, book.operations) > 0;
  const fixedCurrency = book.gameCurrencies?.find(c => c.code === item.currency);
  const linked = book.operations.filter(o => o.sourceId === id || o.parentId === id || o.selected.includes(id) || o.allocations.some(a => a.targetId === id));
  const differentUse = item.useKind === "period" || item.useDate !== item.paymentDate || item.useTime !== item.time;
  const personal = item.shared || recovered || isCancelled || hasLoanPrincipal(item);
  return <>
    <header className="mb-6 flex items-center justify-between gap-3"><Link className="text-sm text-muted-foreground hover:text-primary" href={`/?date=${back}`}>← 일일 내역으로</Link><Button asChild variant="secondary"><Link href={`/transactions/${id}/edit`}>수정하기</Link></Button></header>
    {query.get("saved") === "1" ? <p role="status" className="mb-4 rounded-xl bg-secondary px-5 py-3 text-sm text-primary">저장했어요. 내역과 소비 합계에 반영했어요.</p> : null}
    <article className="book-sheet expense-detail overflow-hidden rounded-[2rem] bg-card">
      <header className="expense-hero">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3"><span className="expense-category">{category.label}</span>{item.useKind === "period" ? <span className="text-xs text-muted-foreground">기간형 이용</span> : null}</div>
          <h1 className="expense-title">{item.title}</h1>
          <p className="mt-4 text-sm text-muted-foreground">{item.paymentDate}{item.time ? ` · ${item.time}` : item.useKind === "period" ? "" : " · 시각 미확인"}</p>
          <p aria-label="전체 결제 금액" className={`expense-total ${isCancelled ? "text-muted-foreground line-through" : "text-primary"}`}>{formatMoney(item.paidAmount, item.currency)}</p>
          {personal ? <div className="mt-4 space-y-1 text-sm"><p className="font-medium text-primary">{isCancelled ? "전액 취소 · 내 소비 0원" : `${recovered ? "보험금 반영 후 " : ""}내 소비 ${krw !== null ? formatMinor(krw, "KRW") : formatMinor(consumptionMinor(item), item.currency)}`}</p>{item.shared && item.currency !== "KRW" ? <p className="text-xs text-muted-foreground">내 몫 {formatMinor(ownMinor(item), item.currency)}</p> : null}</div> : null}
          {item.currency !== "KRW" ? <p className="mt-3 text-sm text-muted-foreground">{item.krwAmount === null ? "원화 미확정 · 합계에서 분리" : `${personal ? "전체 결제 원화 " : "원화 "}${formatMoney(item.krwAmount, "KRW")}`}</p> : null}
        </div>
        <Image src={category.image} alt="" width={360} height={360} loading="eager" sizes="(max-width: 640px) 42vw, 340px" className="expense-character" />
      </header>
      <div className="expense-body">
        {hasLoanPrincipal(item) ? <p className="rounded-xl bg-secondary/50 p-4 text-sm leading-6">대출 원금은 소비에서 제외하고 실제 결제액은 원장에 반영해요. 이자는 대출 이외의 카테고리로 기록해 주세요.</p> : null}
        <ExpenseReceipt expense={item} />
        <section className="expense-payment" aria-label="결제와 이용 정보">
          <h2 className="text-lg font-medium">{item.assetId ? <Link className="text-primary hover:underline" href={`/assets/${item.assetId}`}>{item.paymentMethod} · 원장 보기 →</Link> : item.paymentMethod}</h2>
          <p className="mt-1 text-xs text-muted-foreground">{item.paymentKind === "card" ? "결제한 신용카드" : item.paymentKind === "debit" ? "결제한 체크카드" : "결제한 자산"}</p>
          {differentUse ? <p className="mt-5 text-sm leading-7"><span className="mr-3 text-muted-foreground">{item.useKind === "period" ? "이용기간" : "이용일"}</span>{item.useDate}{item.useKind === "once" ? item.useTime ? ` · ${item.useTime}` : " · 시각 미확인" : ""}{item.useKind === "period" ? ` ~ ${item.useEnd}` : ""}</p> : null}
          {item.valuationRate !== null ? <p className="mt-4 text-sm text-muted-foreground">{fixedCurrency ? "재화 고정 환율" : "원화 환산 기준"} · 1 {currencyInfo(item.currency).unit} = {item.valuationRate}원{!fixedCurrency && item.valuationSource && !["linked-topup", "manual", "재화 고정 환율"].includes(item.valuationSource) ? <Link className="ml-3 text-primary hover:underline" href={`/records/${item.valuationSource.split("/")[0]}`}>충전 기준 보기 →</Link> : null}</p> : null}
          <details className="mt-5 text-xs text-muted-foreground"><summary className="w-fit">소비 반영 기준</summary><p className="mt-3 leading-6">{item.useKind === "period" ? item.allocation === "annual" ? "시작월부터 12개월 배분" : "시작월 정기지출" : `${bookDate(item.useDate, item.useTime)}의 일일 소비 · 05시 기준`}</p>{item.shared ? <p className="mt-2 leading-6">본인 부담액을 소비에 반영하고 전체 결제액은 원장에 기록해요.</p> : null}</details>
        </section>
        {item.memo ? <section className="border-t border-border/70 pt-7"><h2 className="mb-3 text-sm font-medium text-muted-foreground">메모</h2><p className="whitespace-pre-wrap break-words text-sm leading-7">{item.memo}</p></section> : null}
        <section className="border-t border-border/70 pt-7"><h2 className="mb-4 text-sm font-medium text-muted-foreground">이 거래에서 이어서</h2><div className="flex flex-wrap gap-2"><Button asChild variant="secondary"><Link href={`/records/new?kind=template&source=${id}`}>자주 쓰는 거래에 등록</Link></Button>{item.shared && !isCancelled ? <Button asChild variant="secondary"><Link href={`/records/new?kind=recovery&source=${id}`}>분담금 회수 · 잔여 {formatMinor(sharedRemaining(item, book.operations), item.currency)}</Link></Button> : null}{item.category === "medical" && !isCancelled ? <Button asChild variant="secondary"><Link href={`/records/new?kind=insurance&source=${id}`}>보험금 회수</Link></Button> : null}{item.paymentKind === "card" && !isCancelled ? <Button asChild variant="secondary"><Link href={`/records/new?kind=cancel&source=${id}`}>전액 취소 기록</Link></Button> : null}</div>{linked.length ? <ul className="mt-5 space-y-3">{linked.map(o => <li key={o.id}><Link className="text-sm text-primary hover:underline" href={`/records/${o.id}`}>{operationLabels[o.kind]} · {o.title} →</Link></li>)}</ul> : null}</section>
        <Link className="inline-block text-sm font-medium text-primary" href={`/month?month=${(item.useKind === "once" ? bookDate(item.useDate, item.useTime) : item.useDate).slice(0, 7)}`}>이용월의 소비 살펴보기 →</Link>
      </div>
    </article><DemoNotice />
  </>;
}
