"use client";

import Form from "next/form";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Search, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LedgerState } from "@/components/ledger-state";
import { useBook } from "@/lib/use-operations";
import { useCurrencies } from "@/lib/use-currencies";
import { parseDateQuery } from "@/lib/date";
import { searchBookRecords } from "@/lib/record-search";

const pageSize = 30;
const fieldClass = "mt-2 w-full rounded-xl border border-border bg-background px-4 py-3 text-sm";

export function RecordSearch() {
  const params = useSearchParams();
  const query = params.get("q") ?? "";
  const start = parseDateQuery(params.get("start")) ?? "";
  const end = parseDateQuery(params.get("end")) ?? "";
  const collection = ["expenses", "operations"].includes(params.get("collection") ?? "") ? params.get("collection")! : "all";
  const invalidRange = Boolean(start && end && start > end);
  const { data: book, error, retry } = useBook();
  const { formatMoney } = useCurrencies();
  const results = book && !invalidRange ? searchBookRecords(book, { query, start, end, collection }) : [];
  const requestedPage = Number(params.get("page") ?? 1);
  const pageCount = Math.max(1, Math.ceil(results.length / pageSize));
  const page = Number.isSafeInteger(requestedPage) ? Math.min(Math.max(1, requestedPage), pageCount) : 1;
  function pageHref(value: number) {
    const next = new URLSearchParams(params.toString());
    next.set("page", String(value));
    return `/search?${next.toString()}`;
  }

  return <>
    <header className="mb-7"><p className="mb-2 text-xs font-semibold tracking-widest text-primary">지난 기록 다시 펼치기</p><h1 className="text-3xl font-bold tracking-tight">내역 검색</h1><p className="mt-3 text-sm text-muted-foreground">전에 어떻게 입력했는지, 상품과 메모까지 찾아보세요.</p></header>
    <Form key={params.toString()} action="/search" role="search" className="book-sheet rounded-3xl bg-card p-5 sm:p-7">
      <label htmlFor="record-query" className="text-sm font-medium">검색어</label>
      <div className="mt-2 flex flex-col gap-3 sm:flex-row"><input id="record-query" name="q" type="search" defaultValue={query} maxLength={200} placeholder="거래명, 상품명, 메모, 결제수단" className="min-w-0 flex-1 rounded-xl border border-border bg-background px-4 py-3 text-sm" /><Button type="submit" className="h-auto gap-2 py-3"><Search size={17} aria-hidden="true" />검색</Button></div>
      <div className="mt-5 grid gap-4 sm:grid-cols-3">
        <label className="text-sm">시작일<input type="date" name="start" defaultValue={start} className={fieldClass} /></label>
        <label className="text-sm">종료일<input type="date" name="end" defaultValue={end} className={fieldClass} /></label>
        <label className="text-sm">기록 종류<select name="collection" defaultValue={collection} className={fieldClass}><option value="all">전체 기록</option><option value="expenses">지출</option><option value="operations">수입·이동·정산 등</option></select></label>
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs leading-6 text-muted-foreground"><p>기간을 비우면 전체 기간을 찾아요. 지출은 결제일, 다른 기록은 관련 입출금 날짜로 검색해요.</p><Link href="/search" className="font-medium text-primary underline underline-offset-4">조건 초기화</Link></div>
    </Form>
    {invalidRange ? <p role="alert" className="mt-5 rounded-xl bg-card p-5 text-sm">종료일을 시작일과 같거나 그 이후로 선택해 주세요.</p> : !book ? <div className="mt-5"><LedgerState error={error} retry={retry} /></div> : <section aria-label="검색 결과" className="mt-6">
      <p role="status" className="mb-4 text-sm text-muted-foreground">{query.trim() ? `‘${query.trim()}’ 검색 결과` : "저장된 기록"} <strong className="text-foreground">{results.length.toLocaleString("ko-KR")}건</strong> · 최근 날짜순</p>
      {results.length === 0 ? <div className="book-sheet rounded-3xl bg-card px-6 py-14 text-center"><Search className="mx-auto mb-4 text-primary" size={28} aria-hidden="true" /><h2 className="font-semibold">조건에 맞는 내역이 없어요</h2><p className="mt-2 text-sm text-muted-foreground">다른 단어를 입력하거나 검색 기간을 넓혀보세요.</p></div> : <ul className="book-sheet divide-y divide-border/60 rounded-3xl bg-card px-3 sm:px-5">{results.slice((page - 1) * pageSize, page * pageSize).map(row => <li key={row.id}>
        <Link href={row.href} className="transaction-link flex items-center gap-3 rounded-xl px-3 py-5 sm:px-4" aria-label={`${row.title} 상세 보기`}>
          <div className="min-w-0 flex-1"><p className="text-xs text-muted-foreground">{row.date} · {row.label}</p><h2 className="mt-2 break-words font-semibold">{row.title}</h2>{row.context ? <p className="mt-2 line-clamp-2 break-words text-xs leading-6 text-muted-foreground">{row.context}</p> : null}{row.memo ? <p className="mt-1 line-clamp-2 whitespace-pre-wrap break-words text-sm text-muted-foreground">{row.memo}</p> : null}<p className="mt-3 text-sm font-semibold text-primary">{row.amount ? `입력 금액 ${formatMoney(row.amount, row.currency)}` : "금액·세부내역 확인 →"}</p></div><ChevronRight size={18} aria-hidden="true" className="shrink-0 text-primary" />
        </Link>
      </li>)}</ul>}
      {pageCount > 1 ? <nav aria-label="검색 결과 페이지" className="mt-5 flex items-center justify-center gap-5 text-sm">{page > 1 ? <Link href={pageHref(page - 1)} className="text-primary underline">이전</Link> : null}<span>{page} / {pageCount}</span>{page < pageCount ? <Link href={pageHref(page + 1)} className="text-primary underline">다음</Link> : null}</nav> : null}
      <p className="mt-4 text-xs leading-6 text-muted-foreground">저장한 원본 기록을 보여줘요. 지출 금액은 분담·취소·보험금 반영 전 결제액이며, 상세에서 상품·할인과 연결 기록을 확인할 수 있어요. 휴지통의 기록은 검색에서 제외돼요.</p>
    </section>}
  </>;
}
