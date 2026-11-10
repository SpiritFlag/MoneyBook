import Link from "next/link";
import { signedMinor } from "@/lib/asset";
import type { Card } from "@/lib/card";
import { cardActivity, cardStatements } from "@/lib/card-activity";
import { formatMinor } from "@/lib/expense";
import type { BookData, Operation } from "@/lib/operations";

function StatementSummary({ statement }: { statement?: Operation }) {
  if (!statement) return <p className="mt-3 text-sm text-muted-foreground">아직 기록한 명세서가 없어요.</p>;

  const amount = signedMinor(statement.amount, "KRW");
  const status = statement.payment ? "납부 완료" : statement.verified ? "검산 완료 · 납부 대기" : "임시저장 · 대조 중";
  return <Link href={`/records/${statement.id}${statement.verified ? "" : "/edit"}`}
    className="transaction-link mt-3 block rounded-xl bg-card px-4 py-3">
    <span className="text-xs text-muted-foreground">{statement.month} 명세서</span>
    <div className="mt-1 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
      <span className="text-lg font-semibold tabular-nums">{amount === null ? "청구 총액 미입력" : formatMinor(amount, "KRW")}</span>
      <span className="text-sm text-primary">{status}</span>
    </div>
  </Link>;
}

function CardRow({ card, book }: { card: Card; book: BookData }) {
  const debit = card.kind === "debit";
  const activityLabel = debit ? "결제" : "승인";
  const account = debit && book.assets.find(asset => asset.id === card.assetId && asset.kind === "account");
  return <li className="overflow-hidden rounded-2xl bg-secondary/40">
    <div className="p-5">
      <p className="text-xs text-muted-foreground">{debit ? "체크카드" : "신용카드"}{card.issuer ? ` · ${card.issuer}` : ""}</p>
      <h3 className="mt-2 break-words text-lg font-semibold"><Link className="hover:underline" href={`/cards/${card.id}`}>{card.name}</Link></h3>
      {debit ? <div className="mt-3 rounded-xl bg-card px-4 py-3">
        <p className="text-xs text-muted-foreground">출금 계좌</p>
        {account ? <Link className="mt-1 inline-block break-words font-semibold text-primary hover:underline" href={`/assets/${account.id}`}>{account.name} 원장 →</Link>
          : <p className="mt-1 text-sm">출금 계좌 확인 필요</p>}
      </div> : <StatementSummary statement={cardStatements(card, book)[0]} />}
      <Link href={`/cards/${card.id}`} aria-label={`${card.name} ${activityLabel}내역 보기`}
        className="mt-4 inline-block text-sm font-medium text-primary hover:underline">{activityLabel} 내역 {cardActivity(card, book).length}건 →</Link>
    </div>
    <div className="flex flex-wrap justify-between gap-3 border-t border-border/50 px-5 py-4 text-sm font-medium text-primary">
      <Link className="hover:underline" href={`/transactions/new?card=${card.id}`}>이 카드로 지출 기록 →</Link>
      <Link className="hover:underline" href={`/cards/${card.id}/edit`} aria-label={`${card.name} 수정`}>수정</Link>
    </div>
  </li>;
}

export function CardList({ book }: { book: BookData }) {
  return <section className="book-sheet mb-6 rounded-3xl bg-card p-5 sm:p-7">
    <h2 className="text-lg font-semibold">내 카드 <span className="ml-2 text-sm font-normal text-muted-foreground">{book.cards?.length ?? 0}장</span></h2>
    {book.cards?.length ? <ul className="mt-5 grid gap-4 sm:grid-cols-2">
      {book.cards.map(card => <CardRow key={card.id} card={card} book={book} />)}
    </ul> : <div className="py-8 text-center"><p className="text-muted-foreground">아직 등록한 카드가 없어요.</p><Link href="/cards/new" className="mt-3 inline-block text-sm font-medium text-primary">첫 카드 추가 →</Link></div>}
  </section>;
}
