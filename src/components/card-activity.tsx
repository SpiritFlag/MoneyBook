"use client";
import { useState } from "react";
import Link from "next/link";
import type { Card } from "@/lib/card";
import { cardActivity } from "@/lib/card-activity";
import { parseDateQuery } from "@/lib/date";
import type { BookData } from "@/lib/operations";
import { useBook } from "@/lib/use-operations";
import { useCurrencies } from "@/lib/use-currencies";
import { Field } from "./form-fields";
import { LedgerState } from "./ledger-state";
import { Button } from "./ui/button";

export function CardActivityPage({ id, today }: { id: string; today: string }) {
  const { data: book, error, retry } = useBook();
  if (!book || error) return <LedgerState error={error} retry={retry} />;
  const card = book.cards?.find(card => card.id === id);
  if (!card) return <div className="book-sheet rounded-3xl bg-card p-8"><p>카드를 찾을 수 없어요.</p><Link className="mt-4 inline-block text-primary" href="/cards">카드 관리로 →</Link></div>;
  return <CardActivityView key={card.id} card={card} book={book} today={today} />;
}

export function CardActivityView({ card, book, today }: { card: Card; book: BookData; today: string }) {
  const { formatMoney, formatMinor } = useCurrencies();
  const [start, setStart] = useState(""), [end, setEnd] = useState("");
  const invalid = !!((start && !parseDateQuery(start)) || (end && !parseDateQuery(end)) || (start && end && start > end));
  const rows = invalid ? [] : cardActivity(card, book, start, end);
  const statements = book.operations.filter(op => op.kind === "statement" && op.card === card.name)
    .sort((a, b) => b.month.localeCompare(a.month) || b.updatedAt.localeCompare(a.updatedAt));
  const draft = statements.find(op => !op.verified);
  const statementQuery = new URLSearchParams({ kind: "statement", card: card.id, date: today });
  if (start && !invalid) statementQuery.set("start", start);
  if (end && !invalid) statementQuery.set("end", end);
  return <>
    <header className="mb-7">
      <Link href="/cards" className="text-sm text-muted-foreground">← 카드 관리로</Link>
      <p className="mt-5 text-xs text-muted-foreground">{card.kind === "debit" ? "체크카드" : "신용카드"}{card.issuer ? ` · ${card.issuer}` : ""}</p>
      <h1 className="mt-2 break-words text-3xl font-bold">{card.name} · {card.kind === "debit" ? "결제" : "승인"}내역</h1>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">{card.kind === "debit" ? "실제 결제일 기준으로 지출과 카드 충전을 모아 봐요." : "1차로 승인내역을 확인하고 빠진 거래를 채운 뒤, 명세서에서 청구할인과 총액을 2차 대조하세요."}</p>
      <div className="mt-5 flex flex-wrap gap-2">
        <Button asChild><Link href={`/transactions/new?card=${card.id}&date=${today}`}>빠진 거래 기록</Link></Button>
        {card.kind !== "debit" ? <Button asChild variant="secondary"><Link aria-disabled={invalid} onClick={e => { if (invalid) e.preventDefault(); }} href={draft ? `/records/${draft.id}/edit` : `/records/new?${statementQuery}`}>{draft ? "임시저장 명세서 2차 대조 →" : "명세서 2차 대조 →"}</Link></Button> : null}
      </div>
      {card.kind !== "debit" && draft ? <p className="mt-3 text-xs leading-6 text-muted-foreground">진행 중인 {draft.month} 명세서는 저장한 이용기간({draft.start} ~ {draft.end})으로 이어서 열어요.</p> : null}
    </header>
    <section className="book-sheet rounded-3xl bg-card p-5 sm:p-7">
      <h2 className="font-semibold">{card.kind === "debit" ? "결제" : "승인"}일 기준 조회</h2>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Field label="조회 시작일"><input className="form-control" type="date" value={start} onChange={e => setStart(e.target.value)} /></Field>
        <Field label="조회 종료일"><input className="form-control" type="date" value={end} onChange={e => setEnd(e.target.value)} /></Field>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => { setStart(today.slice(0, 7) + "-01"); setEnd(today); }}>이번 달</Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => { setStart(""); setEnd(""); }}>전체 기간</Button>
      </div>
      {invalid ? <p role="alert" className="mt-4 text-sm text-destructive">조회 시작일과 종료일을 확인해 주세요.</p> : <p className="mt-5 text-sm text-muted-foreground" role="status">{rows.length}건{card.kind !== "debit" ? ` · 명세서 미대조 ${rows.filter(row => !row.cancelled && !row.statement).length}건 · 원화 미확정 ${rows.filter(row => row.krwAmount === null).length}건` : ""}</p>}
      <p className="mt-2 text-xs leading-6 text-muted-foreground">금액은 분담 전 결제 전체액이에요. 취소된 승인도 원금과 함께 표시해요.{card.kind !== "debit" ? " 청구할인은 명세서에서 반영해요." : ""}</p>
      <ul className="mt-4 space-y-3">
        {rows.map(row => <li key={row.id} className="rounded-2xl bg-background/70 p-4 sm:p-5">
          <Link href={row.href} className="transaction-link flex flex-wrap items-start justify-between gap-3 rounded-lg" aria-label={`${row.title} 상세 보기`}>
            <div className="min-w-0 flex-1"><p className="text-xs text-muted-foreground">{row.date} · {row.time ?? "시각 미확인"}{row.topup ? " · 카드 충전" : ""}</p><h3 className="mt-2 break-words font-semibold">{row.title}</h3></div>
            <div className="max-w-full text-right tabular-nums"><p className="font-semibold">{formatMoney(row.amount, row.currency)}</p>{row.currency !== "KRW" && card.kind !== "debit" ? <p className="mt-1 text-xs text-primary">{row.krwAmount === null ? "원화 미확정" : `확정 원화 ${formatMinor(row.krwAmount, "KRW")}`}</p> : null}</div>
          </Link>
          <div className="mt-3 flex flex-wrap gap-2 text-xs">
            {row.cancelled ? <span className="rounded-full bg-secondary px-3 py-1 text-muted-foreground">전액 취소 · 원승인 보존</span> : null}
            {card.kind !== "debit" ? row.statement ? <Link className="rounded-full bg-secondary px-3 py-1 text-primary hover:underline" href={`/records/${row.statement.id}`}>{row.statement.month} · {row.statement.payment ? "납부 완료" : "명세서 검산 완료"}</Link>
              : row.draft ? <Link className="rounded-full bg-secondary px-3 py-1 text-primary hover:underline" href={`/records/${row.draft.id}/edit`}>{row.draft.month} · 임시저장 대조 중</Link>
                : !row.cancelled ? <span className="rounded-full bg-secondary px-3 py-1 text-muted-foreground">명세서 대조 전</span> : null : null}
          </div>
        </li>)}
      </ul>
      {!invalid && !rows.length ? <p className="py-10 text-center text-sm text-muted-foreground">이 기간에 기록한 내역이 없어요. 기간을 바꾸거나 빠진 거래를 기록해 주세요.</p> : null}
    </section>
    {card.kind !== "debit" && statements.length ? <section className="book-sheet mt-6 rounded-3xl bg-card p-5 sm:p-7">
      <h2 className="font-semibold">이 카드의 명세서</h2><ul className="mt-4 space-y-2">{statements.map(op => <li key={op.id}><Link className="transaction-link flex flex-wrap justify-between gap-2 rounded-xl bg-background/70 p-4 text-sm text-primary" href={`/records/${op.id}${op.verified ? "" : "/edit"}`}><span>{op.month} · {op.title}</span><span>{op.payment ? "납부 완료" : op.verified ? "검산 완료 · 납부 대기" : "임시저장 · 대조 이어하기 →"}</span></Link></li>)}</ul>
    </section> : null}
  </>;
}
