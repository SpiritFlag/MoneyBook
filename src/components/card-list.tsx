import Link from "next/link";
import type { BookData } from "@/lib/operations";
import { cardActivity } from "@/lib/card-activity";

export function CardList({ book }: { book: BookData }) {
  return <section className="book-sheet mb-6 rounded-3xl bg-card p-5 sm:p-7">
    <h2 className="text-lg font-semibold">내 카드 <span className="ml-2 text-sm font-normal text-muted-foreground">{book.cards?.length ?? 0}장</span></h2>
    {book.cards?.length ? <ul className="mt-5 grid gap-4 sm:grid-cols-2">
      {book.cards.map(card => <li key={card.id} className="overflow-hidden rounded-2xl bg-secondary/40">
        <Link href={`/cards/${card.id}`} className="transaction-link block p-5" aria-label={`${card.name} ${card.kind === "debit" ? "결제" : "승인"}내역 보기`}>
          <p className="text-xs text-muted-foreground">{card.kind === "debit" ? "체크카드" : "신용카드"}{card.issuer ? ` · ${card.issuer}` : ""}</p>
          <h3 className="mt-2 break-words text-lg font-semibold">{card.name}</h3>
          <p className="mt-2 text-xs text-muted-foreground">{card.kind === "debit" ? "결제" : "승인"} 기록 {cardActivity(card, book).length}건</p>
          {card.kind === "debit" ? <p className="mt-2 text-xs text-muted-foreground">출금 계좌 · {book.assets.find(a => a.id === card.assetId)?.name ?? "계좌 확인 필요"}</p> : null}
          <p className="mt-4 text-sm font-medium text-primary">{card.kind === "debit" ? "결제" : "승인"}내역 보기 →</p>
        </Link>
        <div className="flex flex-wrap justify-between gap-3 border-t border-border/50 px-5 py-4 text-sm font-medium text-primary">
          <Link className="hover:underline" href={`/transactions/new?card=${card.id}`}>이 카드로 지출 기록 →</Link>
          <Link className="hover:underline" href={`/cards/${card.id}/edit`} aria-label={`${card.name} 수정`}>수정</Link>
        </div>
      </li>)}
    </ul> : <div className="py-8 text-center"><p className="text-muted-foreground">아직 등록한 카드가 없어요.</p><Link href="/cards/new" className="mt-3 inline-block text-sm font-medium text-primary">첫 카드 추가 →</Link></div>}
    <p className="mt-4 text-xs leading-6 text-muted-foreground">카드를 눌러 승인내역을 먼저 확인하고, 빠진 거래를 기록한 뒤 명세서에서 2차 대조하세요. 체크카드는 연결 계좌에서 결제액을 바로 차감해요.</p>
  </section>;
}
